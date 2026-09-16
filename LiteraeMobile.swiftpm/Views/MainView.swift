import SwiftUI

public struct MainView: View {
    @StateObject private var importer = PackageImporter.shared
    @State private var isShowingFilePicker: Bool = false
    @State private var selectedDocument: Document? = nil

    public init() {}

    public var body: some View {
        NavigationSplitView {
            BookshelfView()
                .navigationTitle("Literae 随身文库")
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button(action: { isShowingFilePicker = true }) {
                            Image(systemName: "plus.circle.fill")
                                .font(.title3)
                                .foregroundColor(Color(red: 0.65, green: 0.23, blue: 0.17))
                        }
                    }
                }
        } detail: {
            if let doc = selectedDocument {
                DocumentDetailView(document: doc)
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "books.vertical.fill")
                        .font(.system(size: 64))
                        .foregroundColor(Color(red: 0.65, green: 0.23, blue: 0.17).opacity(0.3))
                    Text("从左侧书架选择文献开始通读")
                        .font(.headline)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(red: 0.95, green: 0.92, blue: 0.85).opacity(0.2))
            }
        }
        .fileImporter(
            isPresented: $isShowingFilePicker,
            allowedContentTypes: [.zip, .data],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                if let url = urls.first {
                    importer.importPackage(from: url)
                }
            case .failure(let error):
                print("File selection error: \(error)")
            }
        }
        .overlay {
            if importer.isImporting {
                ZStack {
                    Color.black.opacity(0.4)
                        .ignoresSafeArea()

                    VStack(spacing: 16) {
                        ProgressView(value: importer.progress)
                            .progressViewStyle(.linear)
                            .tint(Color(red: 0.65, green: 0.23, blue: 0.17))
                            .frame(width: 220)

                        Text(importer.statusMessage)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.primary)

                        Text("\(Int(importer.progress * 100))%")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(28)
                    .background(Color.white)
                    .cornerRadius(20)
                    .shadow(radius: 20)
                }
            }
        }
    }
}
