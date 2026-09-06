import ExpoModulesCore

private func toEventBody(_ body: [String: Any]) -> [String: Any?] {
  var out = [String: Any?]()
  for (key, value) in body {
    out[key] = value
  }
  return out
}

// A plain `AsyncFunction([String: Any], Promise)` argument crosses the bridge
// with JS numbers represented as Swift `Double` (expo-modules-core's own
// dynamic-cast code confirms this — see DynamicRawType's Double/Float
// handling), not `Int` or `NSNumber`. `options["year"] as? Int` therefore
// fails silently and falls back to a default — every date/time field below
// was actually reaching the native call as 0 (year 0!), so the timesync
// call "succeeded" (a well-formed write/ack exchange) while writing a
// nonsense date the computer understandably didn't visibly apply. Accepting
// either representation here is what actually needs to happen.
private func intOption(_ options: [String: Any], _ key: String) -> Int {
  if let value = options[key] as? Int { return value }
  if let value = options[key] as? Double { return Int(value) }
  if let value = options[key] as? NSNumber { return value.intValue }
  return 0
}

// `Promise.reject(code:description:)` looks like it should surface `description`
// to JS, but it doesn't: expo-modules-core's `Exception(name:description:code:)`
// sets `.description` while the JS-visible `.message` is `String(reflecting:
// self)`, which resolves to `.debugDescription` — built from `.reason`, a
// separate computed property this initializer never touches, hardcoded to the
// literal string "undefined reason" unless a subclass overrides it (see
// ExpoRuntimeInstaller.swift's ReadOnlyExpoModulesPropertyException for the
// same workaround). That's the "ERR_DIVE_DOWNLOAD: undefined reason" every
// download failure showed, regardless of the real message. This subclass
// overrides `reason` so the actual text reaches JS; naming it
// "DiveDownloadException" also makes the framework derive the same
// "ERR_DIVE_DOWNLOAD" code the caller used to pass explicitly.
private final class DiveDownloadException: GenericException<String>, @unchecked Sendable {
  override var reason: String { param }
}

// Same workaround, for the clock-sync path — kept as its own class (rather
// than reusing DiveDownloadException) purely so `error.code` reads
// "ERR_TIME_SYNC" instead of the misleading "ERR_DIVE_DOWNLOAD" for a
// failure that has nothing to do with downloading dives.
private final class TimeSyncException: GenericException<String>, @unchecked Sendable {
  override var reason: String { param }
}

public class DiveComputerBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DiveComputerBridgeModule")

    Events("onDownloadWrite", "onDownloadProgress", "onDownloadDevinfo", "onDownloadDive", "onDownloadLog")

    // Proves the native path (vendored libdivecomputer C -> ObjC shim -> Swift -> JS).
    Function("getVersion") { () -> String in
      DCLibdivecomputer.versionString()
    }

    // --- Download (libdivecomputer over a BLE-backed custom iostream) ---
    //
    // The BLE transport lives in JS (react-native-ble-plx). This module runs
    // libdivecomputer on a background thread and drives the exchange through
    // events: `onDownloadWrite` carries bytes the JS layer must write to the
    // characteristic (then call `provideWriteComplete`), and JS calls
    // `provideBytes` for every notification it receives.

    AsyncFunction("startDownload") { (options: [String: Any], promise: Promise) in
      let name = options["name"] as? String ?? ""
      let vendor = options["vendor"] as? String
      let product = options["product"] as? String
      var fingerprint: Data? = nil
      if let fp = options["fingerprintBase64"] as? String, let data = Data(base64Encoded: fp) {
        fingerprint = data
      }

      DiveComputerDownloader.shared().startDownload(
        withName: name,
        vendor: vendor,
        product: product,
        fingerprint: fingerprint,
        onEvent: { [weak self] eventName, body in
          let payload = toEventBody(body)
          switch eventName {
          case "write": self?.sendEvent("onDownloadWrite", payload)
          case "progress": self?.sendEvent("onDownloadProgress", payload)
          case "devinfo": self?.sendEvent("onDownloadDevinfo", payload)
          case "dive": self?.sendEvent("onDownloadDive", payload)
          case "log": self?.sendEvent("onDownloadLog", payload)
          default: break
          }
        },
        completion: { result, error in
          if let error = error {
            promise.reject(DiveDownloadException(error))
          } else {
            promise.resolve(result ?? [:])
          }
        }
      )
    }

    // --- Clock sync (dc_device_timesync) ---
    //
    // Shares the download's connect/open machinery natively but is a much
    // shorter operation: open a session, write the given wall-clock time, close.
    // Devices whose libdivecomputer backend has no time-sync support (the whole
    // Aqualung/Oceanic/Sherwood ATOM2 family among them) fail cleanly rather
    // than crash — surfaced to JS as a specific, readable error.
    AsyncFunction("syncDeviceTime") { (options: [String: Any], promise: Promise) in
      let name = options["name"] as? String ?? ""
      let vendor = options["vendor"] as? String
      let product = options["product"] as? String
      let year = intOption(options, "year")
      let month = intOption(options, "month")
      let day = intOption(options, "day")
      let hour = intOption(options, "hour")
      let minute = intOption(options, "minute")
      let second = intOption(options, "second")

      // Belt-and-suspenders: a well-formed write/ack exchange with the device
      // reads as "success" even if the date itself is nonsense (year 0 is
      // exactly what a silent argument-conversion failure produced here once
      // already) — refuse to send an obviously-invalid date rather than risk
      // silently writing garbage to someone's dive computer again.
      guard (1...12).contains(month), (1...31).contains(day), year > 2000 else {
        promise.reject(TimeSyncException("Got an invalid date (\(year)-\(month)-\(day)) to sync — not sending it to the computer."))
        return
      }

      DiveComputerDownloader.shared().syncTime(
        withName: name,
        vendor: vendor,
        product: product,
        year: year,
        month: month,
        day: day,
        hour: hour,
        minute: minute,
        second: second,
        onEvent: { [weak self] eventName, body in
          let payload = toEventBody(body)
          switch eventName {
          // "write" is not optional: dc_device_open's own handshake (and
          // dc_device_timesync itself) both need bytes written to the BLE
          // characteristic, exactly like a download does. Without forwarding
          // this, JS never hears the request, never calls
          // provideWriteComplete(), and the native write blocks until it
          // times out — surfacing as "Could not open a session with the dive
          // computer" for every device, since every device's open sequence
          // needs at least one write.
          case "write": self?.sendEvent("onDownloadWrite", payload)
          case "progress": self?.sendEvent("onDownloadProgress", payload)
          case "log": self?.sendEvent("onDownloadLog", payload)
          case "devinfo": self?.sendEvent("onDownloadDevinfo", payload)
          default: break
          }
        },
        completion: { result, error in
          if let error = error {
            promise.reject(TimeSyncException(error))
          } else {
            promise.resolve(result ?? [:])
          }
        }
      )
    }

    Function("provideBytes") { (base64: String) -> Void in
      if let data = Data(base64Encoded: base64) {
        DiveComputerDownloader.shared().provideBytes(data)
      }
    }

    Function("provideWriteComplete") { () -> Void in
      DiveComputerDownloader.shared().notifyWriteComplete()
    }

    Function("cancelDownload") { () -> Void in
      DiveComputerDownloader.shared().cancel()
    }
  }
}
