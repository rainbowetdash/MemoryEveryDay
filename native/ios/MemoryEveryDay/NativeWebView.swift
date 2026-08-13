import SwiftUI
import UserNotifications
import WebKit

struct NativeWebView: UIViewRepresentable {
    @Binding var isLoading: Bool

    func makeCoordinator() -> Coordinator { Coordinator(isLoading: $isLoading) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.ignoresViewportScaleLimits = false
        configuration.userContentController.add(context.coordinator, name: "notifications")
        configuration.userContentController.addUserScript(WKUserScript(
            source: """
            (function () {
              var viewportContent = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
              function lockViewport() {
                var viewports = document.querySelectorAll('meta[name=viewport]');
                if (!viewports.length) { var viewport = document.createElement('meta'); viewport.name = 'viewport'; (document.head || document.documentElement).appendChild(viewport); viewports = [viewport]; }
                viewports.forEach(function (viewport) { viewport.content = viewportContent; });
              }
              lockViewport();
              new MutationObserver(lockViewport).observe(document.documentElement, { childList: true, subtree: true });
              document.addEventListener('gesturestart', function (event) { event.preventDefault(); }, { passive: false });
              document.addEventListener('dblclick', function (event) { event.preventDefault(); }, { passive: false });
              var lastTouchEnd = 0;
              document.addEventListener('touchend', function (event) { var now = Date.now(); if (now - lastTouchEnd < 300) event.preventDefault(); lastTouchEnd = now; }, { passive: false });
            })();
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView.scrollView.minimumZoomScale = 1
        webView.scrollView.maximumZoomScale = 1
        webView.scrollView.bouncesZoom = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.attach(webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) { }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        private var isLoading: Binding<Bool>
        private weak var webView: WKWebView?
        private var foregroundObserver: NSObjectProtocol?
        private var notificationTestObserver: NSObjectProtocol?
        private let siteURL = URL(string: "https://memoryeveryday.pages.dev/")!

        init(isLoading: Binding<Bool>) { self.isLoading = isLoading }

        func attach(_ webView: WKWebView) {
            self.webView = webView
            requestNotificationPermissionIfNeeded()
            foregroundObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.willEnterForegroundNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in self?.loadLatest() }
            notificationTestObserver = NotificationCenter.default.addObserver(
                forName: .memoryEveryDayTestNotificationPresented,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.sendTestNotificationResult(status: "presented", message: "测试成功：系统通知已经显示。")
            }
            loadLatest()
        }

        deinit {
            if let foregroundObserver { NotificationCenter.default.removeObserver(foregroundObserver) }
            if let notificationTestObserver { NotificationCenter.default.removeObserver(notificationTestObserver) }
        }

        func loadLatest() {
            guard let webView else { return }
            isLoading.wrappedValue = true
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
                    URLQueryItem(name: "native-platform", value: "ios"),
                    URLQueryItem(name: "app-version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"),
                    URLQueryItem(name: "reload", value: String(Int(Date().timeIntervalSince1970)))
                ]
                guard let url = components.url else { return }
                var request = URLRequest(url: url)
                request.cachePolicy = .reloadIgnoringLocalCacheData
                webView.load(request)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            isLoading.wrappedValue = false
            sendNotificationStatus()
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url, url.scheme == "memoryeveryday", url.host == "notifications" else {
                decisionHandler(.allow)
                return
            }
            let payload = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "payload" })?.value
            if let payload, let data = payload.data(using: .utf8), let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                handleNotificationMessage(body)
            }
            decisionHandler(.cancel)
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "notifications", let body = message.body as? [String: Any] else { return }
            handleNotificationMessage(body)
        }

        private func handleNotificationMessage(_ body: [String: Any]) {
            guard let action = body["action"] as? String else { return }
            switch action {
            case "request": requestNotificationPermission()
            case "schedule": scheduleNotification(body)
            case "schedule-recurring": scheduleRecurringNotifications(body)
            case "cancel": if let id = body["id"] as? String { cancelNotifications(for: id) }
            case "status": sendNotificationStatus()
            case "test": sendTestNotification()
            case "open-settings": openSettings()
            default: break
            }
        }

        private func requestNotificationPermission() {
            UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
                DispatchQueue.main.async {
                    guard let self else { return }
                    guard settings.authorizationStatus == .notDetermined else {
                        self.sendNotificationStatus()
                        return
                    }
                    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in
                        DispatchQueue.main.async { self.sendNotificationStatus() }
                    }
                }
            }
        }

        private func requestNotificationPermissionIfNeeded() {
            UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
                guard settings.authorizationStatus == .notDetermined else { return }
                DispatchQueue.main.async {
                    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in
                        DispatchQueue.main.async { self?.sendNotificationStatus() }
                    }
                }
            }
        }

        private func sendNotificationStatus() {
            UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
                let status: String
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral: status = "granted"
                case .denied: status = "denied"
                default: status = "default"
                }
                DispatchQueue.main.async { self?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('memoryeveryday-native-notification-status',{detail:{status:'\(status)'}}));") }
            }
        }

        private func scheduleNotification(_ body: [String: Any]) {
            guard let id = body["id"] as? String, let title = body["title"] as? String, let at = (body["at"] as? NSNumber)?.doubleValue else { return }
            cancelNotifications(for: id)
            let date = Date(timeIntervalSince1970: at / 1000)
            schedule(id: id, title: title, body: "该去处理这项日程了", at: date)
            let reminders = body["earlyReminders"] as? [NSNumber] ?? []
            for minutes in reminders {
                let earlyDate = date.addingTimeInterval(-minutes.doubleValue * 60)
                if earlyDate > Date() { schedule(id: "\(id)-early-\(minutes)", title: title, body: "日程即将开始", at: earlyDate) }
            }
        }

        private func scheduleRecurringNotifications(_ body: [String: Any]) {
            guard let id = body["id"] as? String, let title = body["title"] as? String, let occurrences = body["occurrences"] as? [[String: Any]] else { return }
            cancelNotifications(for: id)
            let reminders = body["earlyReminders"] as? [NSNumber] ?? []
            for (index, occurrence) in occurrences.enumerated() {
                guard let at = (occurrence["at"] as? NSNumber)?.doubleValue else { continue }
                let date = Date(timeIntervalSince1970: at / 1000)
                let occurrenceId = "\(id)-repeat-\(index)"
                schedule(id: occurrenceId, title: title, body: "该去处理这项日程了", at: date)
                for minutes in reminders {
                    let earlyDate = date.addingTimeInterval(-minutes.doubleValue * 60)
                    if earlyDate > Date() { schedule(id: "\(occurrenceId)-early-\(minutes)", title: title, body: "日程即将开始", at: earlyDate) }
                }
            }
        }

        private func schedule(id: String, title: String, body: String, at date: Date) {
            guard date > Date() else { return }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            let trigger = UNCalendarNotificationTrigger(dateMatching: Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date), repeats: false)
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
        }

        private func cancelNotifications(for id: String) {
            UNUserNotificationCenter.current().getPendingNotificationRequests { requests in
                let ids = requests.map(\.identifier).filter { $0 == id || $0.hasPrefix("\(id)-") }
                UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
            }
        }

        private func sendTestNotification() {
            let center = UNUserNotificationCenter.current()
            center.getNotificationSettings { [weak self] settings in
                guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional || settings.authorizationStatus == .ephemeral else {
                    DispatchQueue.main.async {
                        self?.sendTestNotificationResult(status: "failed", message: "系统没有允许通知，请到 iPhone 设置中开启通知。")
                    }
                    return
                }
                let content = UNMutableNotificationContent()
                content.title = "每日备忘"
                content.body = "测试成功：App 可以显示日程提醒。"
                content.sound = .default
                let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 2, repeats: false)
                let identifier = "memoryeveryday-test-\(UUID().uuidString)"
                center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)) { error in
                    DispatchQueue.main.async {
                        if let error {
                            self?.sendTestNotificationResult(status: "failed", message: "系统未能发送通知：\(error.localizedDescription)")
                        } else {
                            self?.sendTestNotificationResult(status: "scheduled", message: "通知已交给 iPhone，约 2 秒后显示…")
                        }
                    }
                }
            }
        }

        private func sendTestNotificationResult(status: String, message: String) {
            guard let data = try? JSONSerialization.data(withJSONObject: ["status": status, "message": message]),
                  let detail = String(data: data, encoding: .utf8) else { return }
            webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('memoryeveryday-native-notification-test',{detail:\(detail)}));")
        }

        private func openSettings() {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            DispatchQueue.main.async { UIApplication.shared.open(url) }
        }
    }
}
