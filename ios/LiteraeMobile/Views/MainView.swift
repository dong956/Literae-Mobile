import SwiftUI

public struct MainView: View {
    @StateObject private var importer = PackageImporter.shared
    @State private var isShowingFilePicker: Bool = false
    @State private var selectedDocument: Document? = nil

    public init() {}

    public var body: some View {
        NavigationSplitView {
            BookshelfView()
                .navigationTitle("Literae")
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button(action: { isShowingFilePicker = true }) {
                            Image(systemName: "plus.circle.fill")
                                .font(.title3)
                                .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96))
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
                        .foregroundColor(Color(red: 0.19, green: 0.36, blue: 0.96).opacity(0.28))
                    Text("从左侧书架选择文献开始通读")
                        .font(.headline)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(red: 0.96, green: 0.97, blue: 0.99))
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
                            .tint(Color(red: 0.19, green: 0.36, blue: 0.96))
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
