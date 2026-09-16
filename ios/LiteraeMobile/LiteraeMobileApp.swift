import SwiftUI

@main
struct LiteraeMobileApp: App {
    @StateObject private var importer = PackageImporter.shared

    var body: some Scene {
        WindowGroup {
            MainView()
                .onOpenURL { url in
                    // 处理隔空投送 (AirDrop) 或第三方 App 共享传入的数据包
                    importer.importPackage(from: url)
                }
        }
    }
}
