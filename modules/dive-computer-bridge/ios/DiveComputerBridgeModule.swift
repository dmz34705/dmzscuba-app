import ExpoModulesCore

public class DiveComputerBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DiveComputerBridgeModule")

    // Step 2: prove the native path (vendored libdivecomputer C -> ObjC shim ->
    // Swift -> JS). Scan / connect / download arrive in later steps.
    Function("getVersion") { () -> String in
      DCLibdivecomputer.versionString()
    }
  }
}
