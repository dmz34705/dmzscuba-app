import ExpoModulesCore
import AVFoundation
import CoreImage
import Metal
import UIKit

public class ColorLossCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ColorLossCamera")
    AsyncFunction("requestPermission") { () async -> Bool in
      await AVCaptureDevice.requestAccess(for: .video)
    }
    View(ColorLossCameraView.self) {
      Events("onCameraError", "onCameraReady")
      Prop("matrix") { (view: ColorLossCameraView, values: [Double]) in view.setMatrix(values) }
    }
  }
}

final class ColorLossCameraView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onCameraError = EventDispatcher()
  let onCameraReady = EventDispatcher()
  private let session = AVCaptureSession()
  private let queue = DispatchQueue(label: "com.dmzscuba.colorcamera")
  // Prefer a GPU-backed context: a plain CIContext() renders on the CPU, and
  // doing createCGImage on a background queue ~20×/sec is heavy enough that on
  // some devices frames never make it to the screen and the preview just sits
  // blank. Fall back to the software context only if Metal is unavailable.
  private let context: CIContext = {
    let opts: [CIContextOption: Any] = [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!]
    if let device = MTLCreateSystemDefaultDevice() {
      return CIContext(mtlDevice: device, options: opts)
    }
    return CIContext(options: opts)
  }()
  private var matrix: [Double] = [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0]
  private var configured = false
  private var startAttempted = false
  private var lastFrame = 0.0
  private var sentReady = false
  private var sentError = false
  private var rotation: CGImagePropertyOrientation = .right

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    // Paint frames straight into this view's own layer — no subview, no Auto
    // Layout. Under the New Architecture a constrained child UIImageView could
    // end up zero-sized and the preview would render nowhere.
    layer.contentsGravity = .resizeAspectFill
    // Without these, a runtime error or interruption (another app grabs the
    // camera, a format the session can't negotiate, etc.) fails silently:
    // the session just never produces a frame and the view sits blank with
    // no onCameraError to let the UI show a retry button.
    NotificationCenter.default.addObserver(self, selector: #selector(handleRuntimeError(_:)), name: .AVCaptureSessionRuntimeError, object: session)
    NotificationCenter.default.addObserver(self, selector: #selector(handleInterruption(_:)), name: .AVCaptureSessionWasInterrupted, object: session)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    session.stopRunning()
  }

  @objc private func handleRuntimeError(_ note: Notification) {
    let message = (note.userInfo?[AVCaptureSessionErrorKey] as? NSError)?.localizedDescription ?? "The camera stopped unexpectedly."
    fail(message)
  }

  @objc private func handleInterruption(_ note: Notification) {
    fail("The camera was interrupted by another app. Try again.")
  }

  func setMatrix(_ values: [Double]) {
    guard values.count == 20, values.allSatisfy({ $0.isFinite }) else { return }
    queue.async { [weak self] in self?.matrix = values }
  }

  // Fabric drives this view's lifecycle through several entry points and the
  // order isn't guaranteed, so every one of them just re-syncs the session to
  // "should we be running right now?" and the work itself is idempotent.
  override func didMoveToWindow() {
    super.didMoveToWindow()
    syncSessionState()
  }

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    syncSessionState()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let orientation = window?.windowScene?.interfaceOrientation
    let next: CGImagePropertyOrientation = orientation == .landscapeLeft ? .down : orientation == .landscapeRight ? .up : orientation == .portraitUpsideDown ? .left : .right
    queue.async { [weak self] in self?.rotation = next }
    syncSessionState()
  }

  private func syncSessionState() {
    let onScreen = window != nil
    let size = bounds.size
    queue.async { [weak self] in
      guard let self else { return }
      NSLog("[ColorLossCamera] sync onScreen=\(onScreen) size=\(size) configured=\(self.configured) running=\(self.session.isRunning)")
      if onScreen {
        if !self.configured { self.configure() }
        if self.configured && !self.session.isRunning {
          self.startAttempted = true
          self.session.startRunning()
          NSLog("[ColorLossCamera] startRunning called, isRunning=\(self.session.isRunning)")
          self.watchForFirstFrame()
        }
      } else if self.session.isRunning {
        self.session.stopRunning()
      }
    }
  }

  // A last-resort safety net: if we tried to start the session but no frame
  // shows up, surface an error instead of leaving the view blank forever.
  private func watchForFirstFrame() {
    queue.asyncAfter(deadline: .now() + 5) { [weak self] in
      guard let self, self.startAttempted, !self.sentReady, !self.sentError else { return }
      if self.session.isRunning {
        self.fail("The camera didn't start. Try again, or check that no other app is using it.")
      } else {
        self.fail("The camera session could not start on this device.")
      }
    }
  }

  private func fail(_ message: String) {
    NSLog("[ColorLossCamera] fail: \(message)")
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.sentError else { return }
      self.sentError = true
      self.onCameraError(["message": message])
    }
  }

  private func configure() {
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else { fail("Camera access is disabled. Enable it in Settings."); return }
    guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { fail("No rear camera is available on this device."); return }
    do {
      let input = try AVCaptureDeviceInput(device: camera)
      let output = AVCaptureVideoDataOutput()
      output.alwaysDiscardsLateVideoFrames = true
      output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
      output.setSampleBufferDelegate(self, queue: queue)
      session.beginConfiguration()
      defer { session.commitConfiguration() }
      session.sessionPreset = .vga640x480
      guard session.canAddInput(input), session.canAddOutput(output) else { fail("The camera could not start."); return }
      session.addInput(input)
      session.addOutput(output)
      configured = true
    } catch { fail(error.localizedDescription) }
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    // Frames are flowing — clear the "Starting camera…" spinner immediately,
    // even before the first one finishes rendering, so a slow render pass can
    // never look like a hung/blank preview.
    if !sentReady {
      sentReady = true
      NSLog("[ColorLossCamera] first frame received")
      DispatchQueue.main.async { [weak self] in self?.onCameraReady([:]) }
    }
    let now = CACurrentMediaTime()
    guard now - lastFrame >= 1.0 / 20.0, let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    lastFrame = now
    autoreleasepool {
      let input = CIImage(cvPixelBuffer: buffer).oriented(rotation)
      let m = matrix
      let filtered = input.applyingFilter("CIColorMatrix", parameters: [
        "inputRVector": CIVector(x: m[0], y: m[1], z: m[2], w: m[3]),
        "inputGVector": CIVector(x: m[5], y: m[6], z: m[7], w: m[8]),
        "inputBVector": CIVector(x: m[10], y: m[11], z: m[12], w: m[13]),
        "inputAVector": CIVector(x: m[15], y: m[16], z: m[17], w: m[18]),
        "inputBiasVector": CIVector(x: m[4], y: m[9], z: m[14], w: m[19])
      ])
      guard let image = context.createCGImage(filtered, from: filtered.extent) else {
        NSLog("[ColorLossCamera] createCGImage returned nil")
        fail("The camera preview could not be rendered on this device.")
        return
      }
      DispatchQueue.main.async { [weak self] in
        guard let self else { return }
        // CATransaction without actions: no implicit cross-fade between frames.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        self.layer.contents = image
        CATransaction.commit()
      }
    }
  }
}
