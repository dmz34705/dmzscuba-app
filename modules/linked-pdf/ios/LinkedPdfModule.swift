import ExpoModulesCore
import PDFKit
import UIKit
import WebKit

public class LinkedPdfModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LinkedPdf")
    AsyncFunction("render") { (html: String, width: Double, height: Double) async throws -> [String: Any] in
      let (url, pages) = try await LinkedPdfRenderer.render(html: html, size: CGSize(width: width, height: height))
      return ["uri": url.absoluteString, "numberOfPages": pages]
    }
  }
}

struct LinkedPdfError: LocalizedError {
  let errorDescription: String?
}

// Loads the share HTML at page width, lets its own script lay out the `.pdf-page`
// boxes, then captures each box with createPDF (which keeps link annotations, unlike
// the print renderer) and stitches the pages together.
@MainActor
final class LinkedPdfRenderer: NSObject, WKNavigationDelegate {
  private var loaded: CheckedContinuation<Void, Error>?

  static func render(html: String, size: CGSize) async throws -> (URL, Int) {
    try await LinkedPdfRenderer().run(html: html, size: size)
  }

  private func run(html: String, size: CGSize) async throws -> (URL, Int) {
    let webView = WKWebView(frame: CGRect(origin: .zero, size: size))
    webView.navigationDelegate = self
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      loaded = continuation
      webView.loadHTMLString(html, baseURL: Bundle.main.resourceURL)
    }
    let script = "JSON.stringify(Array.prototype.map.call(document.querySelectorAll('.pdf-page'), function (page) { var r = page.getBoundingClientRect(); return [r.left + window.scrollX, r.top + window.scrollY, r.width, r.height]; }))"
    guard let json = try await webView.evaluateJavaScript(script) as? String,
          let boxes = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [[Double]], !boxes.isEmpty else {
      throw LinkedPdfError(errorDescription: "The plan had no pages to render.")
    }
    let document = PDFDocument()
    for box in boxes where box.count == 4 {
      let configuration = WKPDFConfiguration()
      configuration.rect = CGRect(x: box[0], y: box[1], width: box[2], height: box[3])
      let data = try await webView.pdf(configuration: configuration)
      guard let page = PDFDocument(data: data)?.page(at: 0) else {
        throw LinkedPdfError(errorDescription: "A page of the plan could not be rendered.")
      }
      document.insert(page, at: document.pageCount)
    }
    let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("LinkedPdf", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let url = directory.appendingPathComponent("\(UUID().uuidString).pdf")
    guard document.write(to: url) else {
      throw LinkedPdfError(errorDescription: "The PDF could not be saved.")
    }
    return (url, document.pageCount)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    loaded?.resume()
    loaded = nil
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    loaded?.resume(throwing: error)
    loaded = nil
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    loaded?.resume(throwing: error)
    loaded = nil
  }
}
