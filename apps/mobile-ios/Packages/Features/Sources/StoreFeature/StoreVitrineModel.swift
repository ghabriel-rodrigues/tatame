// Vitrine model (spec 009, STO.14 — stories 18-21): one shared storefront
// for aluno and professor. Search (server-side, name+tags) and the category
// chip filter recompose the same GET /store/products call; the previously
// loaded grid stays visible while a refetch is in flight so the carousel and
// grid never flash away under the typing user (the RN keepPreviousData
// twin). Empty results render the honest empty state — the vitrine never
// fabricates products.

import Foundation
import Observation
import TatameCore

@MainActor
@Observable
public final class StoreVitrineModel {
    public enum Phase: Equatable, Sendable {
        case idle
        case loading
        case loaded(Vitrine)
        case failed(message: String)
    }

    public private(set) var phase: Phase = .idle
    /// Bound to the busca field; server-side search on name + tags.
    public var searchText = ""
    /// nil = the "Tudo" chip.
    public private(set) var selectedCategoryId: UUID?

    @ObservationIgnored private let repository: any StoreRepository

    public init(repository: any StoreRepository) {
        self.repository = repository
    }

    public var vitrine: Vitrine? {
        if case .loaded(let vitrine) = phase { return vitrine }
        return nil
    }

    public var products: [StoreProductCard] { vitrine?.products ?? [] }

    public var categories: [StoreCategory] { vitrine?.categories ?? [] }

    /// Trimmed search sent to the API; empty text means no filter.
    public var searchQuery: String? {
        let trimmed = searchText.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// Fetches with the current search + chip filter. Already-loaded content
    /// stays on screen during the refetch (no flash to skeleton).
    public func load() async {
        if case .loaded = phase {} else {
            phase = .loading
        }
        do {
            phase = .loaded(
                try await repository.vitrine(search: searchQuery, categoryId: selectedCategoryId)
            )
        } catch let error as ApiError {
            phase = .failed(message: StoreMessages.message(for: error, notFound: StoreMessages.loadFailed))
        } catch {
            phase = .failed(message: StoreMessages.generic)
        }
    }

    /// Chip tap: selecting the active chip toggles back to "Tudo" (the RN
    /// twin), then refetches.
    public func selectCategory(_ categoryId: UUID?) async {
        selectedCategoryId = selectedCategoryId == categoryId ? nil : categoryId
        await load()
    }
}
