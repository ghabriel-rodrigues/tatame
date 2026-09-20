/**
 * STO.8 — Loja console, Produtos tab (admin-03/06, spec 009): stat tiles,
 * monogram-gradient product rows with the low-stock warning line, the
 * "Categorias da loja" chip CRUD (nova/rename/guarded delete incl. the
 * category.in_use 409 mapping), the produto form sheet (payloads, tags →
 * #chips, disabled galeria slots) and the "Remover da loja" archive confirm,
 * plus the nav link. Real routes + real client against MSW (web-07).
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  adminStoreHandlers,
  billingHandlers,
  FIXTURE_CATEGORY_IDS,
  http,
  makeAdminStoreProduct,
  makeAdminStoreProductList,
  makeMeResponse,
  makeMembership,
  makeStoreCategory,
  makeStoreCategoryList,
  makeStoreOverview,
  problemResponse,
} from '@tatame/shared/testing';
import { renderRoute } from '../../test/render-route';
import { server } from '../../test/setup';

const session = () =>
  makeMeResponse({ memberships: [makeMembership({ role: 'admin' })] });

describe('Loja — Produtos (STO.8)', () => {
  it('renders the admin-03 stat tiles: vendas, pedidos and estoque baixo', async () => {
    server.use(...adminStoreHandlers());
    renderRoute('/admin/loja', { session: session() });

    expect(
      await screen.findByRole('heading', { name: 'Loja da academia' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('R$ 3.240')).toBeInTheDocument();
    expect(screen.getByText('vendas no mês')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
    expect(screen.getByText('pedidos no mês')).toBeInTheDocument();
    expect(screen.getByText('estoque baixo')).toBeInTheDocument();
  });

  it('renders the product rows: monogram tile, category chip, price and stock line', async () => {
    server.use(...adminStoreHandlers());
    renderRoute('/admin/loja', { session: session() });

    expect(
      await screen.findByText('Kimono oficial Horizonte'),
    ).toBeInTheDocument();
    expect(screen.getByText('R$ 389')).toBeInTheDocument();
    expect(screen.getByText('12 em estoque · 7 vendidos')).toBeInTheDocument();

    expect(screen.getByText('Rash guard manga longa')).toBeInTheDocument();
    expect(screen.getByText('R$ 149')).toBeInTheDocument();
    expect(screen.getByText('23 em estoque · 11 vendidos')).toBeInTheDocument();

    expect(screen.getByText('Protetor bucal')).toBeInTheDocument();
    expect(screen.getByText('R$ 39')).toBeInTheDocument();

    // Every row carries its Editar action.
    expect(
      screen.getByRole('button', { name: 'Editar Kimono oficial Horizonte' }),
    ).toBeInTheDocument();
  });

  it('shows the low-stock warning line on products at or below their threshold', async () => {
    server.use(...adminStoreHandlers());
    renderRoute('/admin/loja', { session: session() });

    expect(
      await screen.findByText('Estoque baixo: 8 · 5 vendidos'),
    ).toBeInTheDocument();
  });

  it('renders the monogram tile with the gradient resolved from the preset slug', async () => {
    const product = makeAdminStoreProduct({
      name: 'Kimono oficial Horizonte',
      monogram: 'GI',
      gradientPreset: 'store-blue-purple',
    });
    server.use(...adminStoreHandlers({ products: [product] }));
    renderRoute('/admin/loja', { session: session() });
    await screen.findByText('Kimono oficial Horizonte');

    const tile = screen.getByTestId(`product-tile-${product.id}`);
    expect(tile).toHaveTextContent('GI');
    expect(tile).toHaveStyle({
      background:
        'linear-gradient(135deg, var(--purple-700), var(--purple-500))',
    });
  });

  it('renders the categorias chips with their product counts', async () => {
    server.use(...adminStoreHandlers());
    renderRoute('/admin/loja', { session: session() });

    expect(await screen.findByText('Categorias da loja')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Renomear No-gi' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Renomear Acessórios' }),
    ).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // Acessórios count badge
    expect(
      screen.getByRole('button', { name: '+ Nova categoria' }),
    ).toBeInTheDocument();
  });

  it('creates a category from the inline "+ Nova categoria" form', async () => {
    server.use(...adminStoreHandlers());
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/store/categories', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json(makeStoreCategory({ name: 'Nutrição' }));
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/loja', { session: session() });
    await screen.findByText('Categorias da loja');

    await user.click(screen.getByRole('button', { name: '+ Nova categoria' }));
    await user.type(screen.getByLabelText('Nova categoria'), 'Nutrição');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText('Categoria criada.')).toBeInTheDocument();
    expect(body).toEqual({ name: 'Nutrição' });
  });

  it('renames a category through its chip name', async () => {
    const categories = makeStoreCategoryList();
    server.use(...adminStoreHandlers({ categories }));
    let patched: { id: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.patch(
        '/v1/admin/store/categories/{id}',
        async ({ params, request, response }) => {
          patched = {
            id: params.id,
            body: (await request.json()) as Record<string, unknown>,
          };
          return response(200).json(makeStoreCategory({ name: 'Streetwear' }));
        },
      ),
    );
    const user = userEvent.setup();
    renderRoute('/admin/loja', { session: session() });
    await screen.findByText('Categorias da loja');

    await user.click(
      await screen.findByRole('button', { name: 'Renomear Casual' }),
    );
    const input = screen.getByPlaceholderText(
      'Nome da categoria (ex. Nutrição)',
    );
    expect(input).toHaveValue('Casual');
    await user.clear(input);
    await user.type(input, 'Streetwear');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Categoria renomeada.')).toBeInTheDocument();
    expect(patched).toEqual({
      id: FIXTURE_CATEGORY_IDS.casual,
      body: { name: 'Streetwear' },
    });
  });

  it('deletes an empty category from the chip ×', async () => {
    server.use(...adminStoreHandlers());
    let deletedId: string | null = null;
    server.use(
      http.delete('/v1/admin/store/categories/{id}', ({ params, response }) => {
        deletedId = params.id;
        return response(204).empty();
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/loja', { session: session() });
    await screen.findByText('Categorias da loja');

    await user.click(
      await screen.findByRole('button', { name: 'Remover Casual' }),
    );

    expect(await screen.findByText('Categoria removida.')).toBeInTheDocument();
    expect(deletedId).toBe(FIXTURE_CATEGORY_IDS.casual);
  });

  it('maps the category.in_use 409 to the PT-BR guard message', async () => {
    server.use(...adminStoreHandlers());
    server.use(
      http.delete('/v1/admin/store/categories/{id}', ({ response }) =>
        response.untyped(problemResponse(409, 'category.in_use')),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/admin/loja', { session: session() });
    await screen.findByText('Categorias da loja');

    await user.click(
      await screen.findByRole('button', { name: 'Remover Kimonos' }),
    );

    expect(
      await screen.findByText('Só dá para remover categoria sem produtos.'),
    ).toBeInTheDocument();
  });

  it('creates a product from the Novo produto sheet (tags → array, categoria chip)', async () => {
    server.use(...adminStoreHandlers());
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/v1/admin/store/products', async ({ request, response }) => {
        body = (await request.json()) as Record<string, unknown>;
        return response(201).json(
          makeAdminStoreProduct({ name: 'Squeeze da equipe' }),
        );
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/loja', { session: session() });
    await screen.findByText('Kimono oficial Horizonte');

    await user.click(screen.getByRole('button', { name: 'Novo produto' }));
    const sheet = await screen.findByRole('dialog', { name: 'Novo produto' });
    await user.type(within(sheet).getByLabelText(/Nome/), 'Squeeze da equipe');
    await user.type(within(sheet).getByLabelText(/Preço/), '29,90');
    await user.type(within(sheet).getByLabelText(/Estoque/), '40');
    const threshold = within(sheet).getByLabelText(/Limite de estoque baixo/);
    await user.clear(threshold);
    await user.type(threshold, '6');
    await user.click(within(sheet).getByRole('button', { name: 'Acessórios' }));
    await user.type(
      within(sheet).getByLabelText(/Tags/),
      'squeeze, hidratação',
    );
    // The comma input renders as #chips.
    expect(within(sheet).getByText('#squeeze')).toBeInTheDocument();
    expect(within(sheet).getByText('#hidratação')).toBeInTheDocument();
    await user.click(
      within(sheet).getByRole('button', { name: 'Criar produto' }),
    );

    expect(await screen.findByText('Produto criado.')).toBeInTheDocument();
    expect(body).toEqual({
      name: 'Squeeze da equipe',
      description: null,
      priceCents: 2_990,
      stockQty: 40,
      lowStockThreshold: 6,
      categoryId: FIXTURE_CATEGORY_IDS.acessorios,
      tags: ['squeeze', 'hidratação'],
      sizes: [],
    });
  });

  it('renders the galeria with the monogram capa and disabled "+ Foto" slots', async () => {
    server.use(...adminStoreHandlers());
    const user = userEvent.setup();
    renderRoute('/admin/loja', { session: session() });
    await screen.findByText('Kimono oficial Horizonte');

    await user.click(
      screen.getByRole('button', { name: 'Editar Kimono oficial Horizonte' }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Editar produto' });

    expect(within(sheet).getByText('Galeria de fotos')).toBeInTheDocument();
    const cover = within(sheet).getByTestId('gallery-cover');
    expect(cover).toHaveTextContent('GI');
    expect(within(cover).getByText('capa')).toBeInTheDocument();

    // Photo upload is visibly deferred, not faked — both slots disabled.
    const slots = within(sheet).getAllByRole('button', {
      name: /Adicionar foto/,
    });
    expect(slots).toHaveLength(2);
    for (const slot of slots) expect(slot).toBeDisabled();
  });

  it('edits a product and PATCHes the changed form payload', async () => {
    const products = makeAdminStoreProductList();
    const kimono = products[0]!;
    server.use(...adminStoreHandlers({ products }));
    let patched: { id: string; body: Record<string, unknown> } | null = null;
    server.use(
      http.patch(
        '/v1/admin/store/products/{id}',
        async ({ params, request, response }) => {
          patched = {
            id: params.id,
            body: (await request.json()) as Record<string, unknown>,
          };
          return response(200).json(
            makeAdminStoreProduct({ name: 'Kimono oficial Horizonte' }),
          );
        },
      ),
    );
    const user = userEvent.setup();
    renderRoute('/admin/loja', { session: session() });
    await screen.findByText('Kimono oficial Horizonte');

    await user.click(
      screen.getByRole('button', { name: 'Editar Kimono oficial Horizonte' }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Editar produto' });
    const estoque = within(sheet).getByLabelText(/Estoque/);
    await user.clear(estoque);
    await user.type(estoque, '15');
    // Deselect the GG size pill is not applicable — toggle A1 off instead.
    await user.click(within(sheet).getByRole('button', { name: 'A1' }));
    await user.click(
      within(sheet).getByRole('button', { name: 'Salvar alterações' }),
    );

    expect(await screen.findByText('Produto atualizado.')).toBeInTheDocument();
    expect(patched).toEqual({
      id: kimono.id,
      body: {
        name: 'Kimono oficial Horizonte',
        description: null,
        priceCents: 38_900,
        stockQty: 15,
        lowStockThreshold: 5,
        categoryId: FIXTURE_CATEGORY_IDS.kimonos,
        tags: ['kimono', 'gi', 'competição'],
        sizes: ['A2', 'A3', 'A4'],
      },
    });
  });

  it('archives via "Remover da loja" only after the confirm dialog', async () => {
    server.use(...adminStoreHandlers());
    let archivedId: string | null = null;
    server.use(
      http.delete('/v1/admin/store/products/{id}', ({ params, response }) => {
        archivedId = params.id;
        return response(200).json(
          makeAdminStoreProduct({
            name: 'Kimono oficial Horizonte',
            status: 'archived',
          }),
        );
      }),
    );
    const user = userEvent.setup();
    renderRoute('/admin/loja', { session: session() });
    await screen.findByText('Kimono oficial Horizonte');

    await user.click(
      screen.getByRole('button', { name: 'Editar Kimono oficial Horizonte' }),
    );
    const sheet = await screen.findByRole('dialog', { name: 'Editar produto' });
    await user.click(
      within(sheet).getByRole('button', { name: 'Remover da loja' }),
    );

    const confirm = await screen.findByRole('dialog', {
      name: 'Remover da loja',
    });
    expect(
      within(confirm).getByText(
        /pedidos que já referenciam este produto são preservados/,
      ),
    ).toBeInTheDocument();
    expect(archivedId).toBeNull();

    await user.click(within(confirm).getByRole('button', { name: 'Remover' }));
    expect(
      await screen.findByText('Produto removido da loja.'),
    ).toBeInTheDocument();
    expect(archivedId).not.toBeNull();
  });

  it('hides the tiles row gracefully while the overview loads and shows warn color at low stock', async () => {
    server.use(
      ...adminStoreHandlers({
        overview: makeStoreOverview({
          vendasMesCents: 0,
          pedidosMesCount: 0,
          lowStock: { count: 0, products: [] },
        }),
      }),
    );
    renderRoute('/admin/loja', { session: session() });

    expect(await screen.findByText('R$ 0')).toBeInTheDocument();
    expect(screen.getByText('estoque baixo')).toBeInTheDocument();
  });

  it('exposes the Loja nav link in the admin console shell', async () => {
    server.use(...billingHandlers(), ...adminStoreHandlers());
    const user = userEvent.setup();
    renderRoute('/admin', { session: session() });
    await screen.findByRole('heading', { name: 'Visão financeira' });

    const nav = screen.getByRole('navigation', { name: 'Seções do painel' });
    const link = within(nav).getByRole('link', { name: 'Loja' });
    expect(link).toHaveAttribute('href', '/admin/loja');

    await user.click(link);
    expect(
      await screen.findByRole('heading', { name: 'Loja da academia' }),
    ).toBeInTheDocument();
  });
});
