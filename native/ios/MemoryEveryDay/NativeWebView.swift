import SwiftUI
import WebKit

struct NativeWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.ignoresViewportScaleLimits = false
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.attach(webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) { }

    final class Coordinator: NSObject, WKNavigationDelegate {
        private weak var webView: WKWebView?
        private var foregroundObserver: NSObjectProtocol?
        private let siteURL = URL(string: "https://memoryeveryday.pages.dev/")!

        func attach(_ webView: WKWebView) {
            self.webView = webView
            foregroundObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.willEnterForegroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in self?.loadLatest() }
            loadLatest()
        }

        deinit {
            if let foregroundObserver { NotificationCenter.default.removeObserver(foregroundObserver) }
        }

        func loadLatest() {
            guard let webView else { return }
            let dataTypes: Set<String> = [
                WKWebsiteDataTypeDiskCache,
                WKWebsiteDataTypeMemoryCache,
                WKWebsiteDataTypeFetchCache,
                WKWebsiteDataTypeServiceWorkerRegistrations
            ]
            WKWebsiteDataStore.default().removeData(ofTypes: dataTypes, modifiedSince: .distantPast) { [weak self, weak webView] in
                guard let self, let webView else { return }
                var components = URLComponents(url: self.siteURL, resolvingAgainstBaseURL: false)!
                components.queryItems = [
                    URLQueryItem(name: "native-shell", value: "1"),
                    URLQueryItem(name: "reload", value: String(Int(Date().timeIntervalSince1970)))
                ]
                guard let url = components.url else { return }
                var request = URLRequest(url: url)
                request.cachePolicy = .reloadIgnoringLocalCacheData
                webView.load(request)
            }
        }
    }
}
