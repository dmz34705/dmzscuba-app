import ExpoModulesCore

private func toEventBody(_ body: [String: Any]) -> [String: Any?] {
  var out = [String: Any?]()
  for (key, value) in body {
    out[key] = value
  }
  return out
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
            promise.reject("ERR_DIVE_DOWNLOAD", error)
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
