import XCTest
import SwiftUI
import WebKit
@testable import MemoryEveryDay

@MainActor
final class WidgetBridgeTests: XCTestCase {
    func testTrustedPageUpdatesWidgetAndOtherOriginCannotOverwriteIt() async throws {
        let coordinator = NativeWebView.Coordinator(isLoading: .constant(false))
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(coordinator, name: "calendarWidget")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        let payload: [String: Any] = ["version": 1, "updatedAt": 12345, "signedIn": true, "days": [["date": "2026-09-09", "items": [["id": "test", "title": "测试安排", "time": "14:00", "endTime": "15:00", "color": "cyan", "todo": false, "endsAt": 1790000000000]]]]]
        let json = String(data: try JSONSerialization.data(withJSONObject: payload), encoding: .utf8)!
        webView.loadHTMLString("<script>window.webkit.messageHandlers.calendarWidget.postMessage(\(json))</script>", baseURL: URL(string: "https://memoryeveryday.pages.dev/"))
        for _ in 0..<50 {
            if WidgetStore.read().updatedAt == 12345 { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertEqual(WidgetStore.read().days.first?.items.first?.title, "测试安排")
        webView.loadHTMLString("<script>window.webkit.messageHandlers.calendarWidget.postMessage({version:1,updatedAt:999,signedIn:false,days:[]})</script>", baseURL: URL(string: "https://example.com/"))
        try await Task.sleep(for: .seconds(1))
        XCTAssertEqual(WidgetStore.read().updatedAt, 12345)
        webView.loadHTMLString("<script>window.webkit.messageHandlers.calendarWidget.postMessage({version:1,updatedAt:888,signedIn:false,days:[]})</script>", baseURL: URL(string: "https://memoryeveryday.pages.dev/"))
        for _ in 0..<50 {
            if WidgetStore.read().updatedAt == 888 { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertFalse(WidgetStore.read().signedIn)
        XCTAssertTrue(WidgetStore.read().days.isEmpty)
    }
}
