// Storefront vitrine (handoff aluno-16/professor-13, spec 009 STO.14): one
// shared feature mounted in both the aluno and professor shells. Header
// "Loja <academia> · Produtos oficiais · retirada na recepção" with the
// Meus pedidos entry (decision mirrored from RN: the pedidos entry lives on
// the vitrine header — the perfil rows stay pure navigation per the
// prototypes), busca over name+tags (server-side, debounced), a WORKING
// horizontally-scrollable category chip carousel ("Tudo" + one chip per
// category) and the unclipped 2-column product grid — the prototype's two
// known bugs (broken carousel, clipped grid) are fixed, not reproduced.
// PT-BR copy; Lumira tokens only.

import DesignSystem
import SwiftUI
import TatameCore

public struct StoreVitrineView: View {
    @State private var model: StoreVitrineModel
    private let academyName: String?
    private let repository: any StoreRepository

    public init(academyName: String?, repository: any StoreRepository) {
        _model = State(initialValue: StoreVitrineModel(repository: repository))
        self.academyName = academyName
        self.repository = repository
    }

    public var body: some View {
        StoreVitrineContent(model: model, academyName: academyName, repository: repository)
    }
}

struct StoreVitrineContent: View {
    @Bindable var model: StoreVitrineModel
    let academyName: String?
    let repository: any StoreRepository

    @Environment(\.dismiss) private var dismiss
    @State private var productTarget: StoreProductTarget?
    @State private var showOrders = false

    private let columns = [
        GridItem(.flexible(), spacing: LumiraTokens.Space.s3, alignment: .top),
        GridItem(.flexible(), spacing: LumiraTokens.Space.s3, alignment: .top),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: LumiraTokens.Space.s4) {
                header
                searchField
                switch model.phase {
                case .idle, .loading:
                    loadingState
                case .failed(let message):
                    StoreErrorBanner(message: message) {
                        Task { await model.load() }
                    }
                case .loaded:
                    chipCarousel
                    if model.products.isEmpty {
                        StoreEmptyCard(
                            title: StoreMessages.emptyVitrine,
                            caption: StoreMessages.emptyVitrineCaption,
                            identifier: "vitrine-empty"
                        )
                    } else {
                        grid
                    }
                }
            }
            .padding(.horizontal, LumiraTokens.Space.s6)
            .padding(.top, LumiraTokens.Space.s4)
            .padding(.bottom, LumiraTokens.Space.s6)
        }
        .background(LumiraTokens.Colors.bgApp)
        // Debounced server-side search: each keystroke restarts the task;
        // the initial appearance (id fires once) is the first load.
        .task(id: model.searchText) {
            if model.vitrine != nil {
                try? await Task.sleep(nanoseconds: 300_000_000)
                guard !Task.isCancelled else { return }
            }
            await model.load()
        }
        .refreshable { await model.load() }
        .storeNavigationBarHiddenOnIOS()
        .navigationDestination(item: $productTarget) { target in
            StoreProductDetailView(productId: target.id, repository: repository)
        }
        .navigationDestination(isPresented: $showOrders) {
            StoreOrdersView(repository: repository)
        }
    }

    // MARK: Header (aluno-16: back, Loja <academia>, retirada subtitle,
    // Meus pedidos entry)

    private var header: some View {
        HStack(spacing: LumiraTokens.Space.s3) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(LumiraTokens.Colors.fg2)
                    .frame(width: 34, height: 34)
                    .background(LumiraTokens.Colors.bgSurface)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1))
            }
            .accessibilityIdentifier("store-back-button")
            VStack(alignment: .leading, spacing: 2) {
                Text(academyName.map { "Loja \($0)" } ?? "Loja da academia")
                    .font(.system(size: LumiraTokens.FontSize.textMd, weight: .bold, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg1)
                    .lineLimit(1)
                    .accessibilityIdentifier("store-title")
                Text("Produtos oficiais · retirada na recepção")
                    .font(.system(size: LumiraTokens.FontSize.text2xs, design: .rounded))
                    .foregroundStyle(LumiraTokens.Colors.fg4)
                    .lineLimit(1)
            }
            Spacer()
            // Documented entry into Meus pedidos (STO.15): the vitrine
            // header — the perfil rows stay pure navigation.
            Button {
                showOrders = true
            } label: {
                Image(systemName: "list.bullet.rectangle")
                    .font(.system(size: LumiraTokens.FontSize.textSm, weight: .semibold))
                    .foregroundStyle(LumiraTokens.Colors.inkPurple)
                    .frame(width: 34, height: 34)
                    .background(LumiraTokens.Colors.purple50)
                    .clipShape(Circle())
            }
            .accessibilityIdentifier("meus-pedidos-entry")
        }
    }

    // MARK: Busca (server-side name+tags)

    private var searchField: some View {
        HStack(spacing: LumiraTokens.Space.s2) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: LumiraTokens.FontSize.textXs))
                .foregroundStyle(LumiraTokens.Colors.fg4)
            TextField("Buscar por nome ou tag (ex: kimono, treino)", text: $model.searchText)
                .font(.system(size: LumiraTokens.FontSize.textSm, design: .rounded))
                .foregroundStyle(LumiraTokens.Colors.fg1)
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
                .accessibilityIdentifier("vitrine-search")
        }
        .padding(.horizontal, LumiraTokens.Space.s4)
        .frame(height: 44)
        .background(LumiraTokens.Colors.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                .strokeBorder(LumiraTokens.Colors.border1, lineWidth: 1)
        )
    }

    // MARK: Working chip carousel (the aluno-16 bug fixed, not reproduced)

    private var chipCarousel: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: LumiraTokens.Space.s2) {
                StoreCategoryChip(
                    label: "Tudo",
                    selected: model.selectedCategoryId == nil,
                    identifier: "category-chip-all"
                ) {
                    Task { await model.selectCategory(nil) }
                }
                ForEach(model.categories) { category in
                    StoreCategoryChip(
                        label: category.name,
                        selected: model.selectedCategoryId == category.id,
                        identifier: "category-chip-\(category.id.uuidString.lowercased())"
                    ) {
                        Task { await model.selectCategory(category.id) }
                    }
                }
            }
            .padding(.vertical, 2)
        }
        .accessibilityIdentifier("category-chips")
    }

    // MARK: Unclipped 2-column grid (the aluno-16 bug fixed, not reproduced)

    private var grid: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: LumiraTokens.Space.s3) {
            ForEach(model.products) { product in
                StoreGridCard(product: product) {
                    productTarget = StoreProductTarget(id: product.id)
                }
            }
        }
        .accessibilityIdentifier("product-grid")
    }

    private var loadingState: some View {
        VStack(spacing: LumiraTokens.Space.s3) {
            HStack(spacing: LumiraTokens.Space.s3) {
                ForEach(0..<2, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                        .fill(LumiraTokens.Colors.bgSunken)
                        .frame(height: 160)
                }
            }
            HStack(spacing: LumiraTokens.Space.s3) {
                ForEach(0..<2, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: LumiraTokens.Radius.md, style: .continuous)
                        .fill(LumiraTokens.Colors.bgSunken)
                        .frame(height: 160)
                }
            }
        }
        .redacted(reason: .placeholder)
    }
}
