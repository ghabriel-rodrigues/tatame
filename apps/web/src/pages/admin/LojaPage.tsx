/**
 * Loja da academia (STO.8-9, admin-03/04/05/06): stat tiles (vendas do mês,
 * pedidos no mês, estoque baixo), the Produtos tab with the "Categorias da
 * loja" chip row (nova/rename/guarded delete) and monogram-tile product rows,
 * the produto form sheet (categoria chips, tags → #chips, tamanhos, galeria
 * with the disabled "+ Foto" slots, Remover da loja = archive with confirm)
 * and the Pedidos board with the admin-05 status sheet (atual marker, valid
 * transitions only, Cancelado → refund confirm).
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  BottomSheet,
  Card,
  Chip,
  EmptyState,
  FormField,
  ListRow,
  ScreenHeader,
  SegmentedControl,
  TatameButton,
  Toast,
} from '@tatame/design-system';
import type {
  AdminStoreOrder,
  AdminStoreProduct,
  StoreCategory,
  StoreOrderStatus,
} from '@tatame/shared';
import { $api, queryClient } from '../../api/api';
import { InitialsAvatar, useToastState } from './common';
import { centsToInput, formatBRLWhole, parseBRLInput } from '../billing-format';
import {
  canTransition,
  ORDER_STATUS_CHIP_TONES,
  ORDER_STATUS_DESCRIPTIONS,
  ORDER_STATUS_DOTS,
  ORDER_STATUS_LABELS,
  orderItemLabel,
  parseTagsInput,
  previewMonogram,
  stockLine,
  storeErrorMessage,
  storeGradientCss,
} from './store-format';

async function invalidateStore() {
  await queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/store/overview'] });
  await queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/store/categories'] });
  await queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/store/products'] });
  await queryClient.invalidateQueries({ queryKey: ['get', '/v1/admin/store/orders'] });
}

/** The admin-03 header tile ("R$ 3.240 / vendas no mês"). */
function StatTile({ value, label, warn = false }: { value: string; label: string; warn?: boolean }) {
  return (
    <Box
      sx={{
        flex: 1,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-1)',
        borderRadius: '16px',
        padding: '12px',
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontSize: 17, fontWeight: 700, color: warn ? 'var(--warning-500)' : 'var(--fg-1)' }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-3)' }}>{label}</Typography>
    </Box>
  );
}

/** The GI/RG/FX monogram square on its gradient preset. */
function MonogramTile({
  monogram,
  gradientPreset,
  size = 46,
  testId,
}: {
  monogram: string;
  gradientPreset: string;
  size?: number;
  testId?: string;
}) {
  return (
    <Box
      component="span"
      aria-hidden
      {...(testId ? { 'data-testid': testId } : {})}
      sx={{
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '13px',
        color: 'var(--white, #FFFFFF)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: '0.06em',
      }}
      style={{ background: storeGradientCss(gradientPreset) }}
    >
      {monogram}
    </Box>
  );
}

/** The admin-13-style outlined pill action (Editar / + Nova categoria). */
function PillButton({
  label,
  ariaLabel,
  onPress,
}: {
  label: string;
  ariaLabel?: string;
  onPress: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={ariaLabel ?? label}
      onClick={onPress}
      sx={{
        flex: 'none',
        padding: '6px 12px',
        border: '1.5px solid var(--purple-200)',
        borderRadius: '999px',
        background: 'none',
        color: 'var(--purple-ink)',
        fontFamily: 'inherit',
        fontWeight: 700,
        fontSize: 10.5,
        cursor: 'pointer',
      }}
    >
      {label}
    </Box>
  );
}

/**
 * "Categorias da loja" — one chip per category (count badge, rename on the
 * name, guarded delete on the ×) plus the "+ Nova categoria" inline form.
 */
function CategoriesCard({
  categories,
  onError,
  onSuccess,
}: {
  categories: StoreCategory[];
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [renaming, setRenaming] = useState<StoreCategory | null>(null);
  const [name, setName] = useState('');

  const create = $api.useMutation('post', '/v1/admin/store/categories');
  const rename = $api.useMutation('patch', '/v1/admin/store/categories/{id}');
  const remove = $api.useMutation('delete', '/v1/admin/store/categories/{id}');
  const busy = create.isPending || rename.isPending || remove.isPending;

  function closeForm() {
    setFormOpen(false);
    setRenaming(null);
    setName('');
  }

  function submit() {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    const options = (message: string) => ({
      onSuccess: async () => {
        await invalidateStore();
        onSuccess(message);
        closeForm();
      },
      onError: (error: unknown) => onError(storeErrorMessage(error)),
    });
    if (renaming) {
      rename.mutate(
        { params: { path: { id: renaming.id } }, body: { name: trimmed } },
        options('Categoria renomeada.'),
      );
    } else {
      create.mutate({ body: { name: trimmed } }, options('Categoria criada.'));
    }
  }

  function deleteCategory(category: StoreCategory) {
    remove.mutate(
      { params: { path: { id: category.id } } },
      {
        onSuccess: async () => {
          await invalidateStore();
          onSuccess('Categoria removida.');
        },
        onError: (error: unknown) => onError(storeErrorMessage(error)),
      },
    );
  }

  return (
    <Box
      sx={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-1)',
        borderRadius: '18px',
        padding: '13px 15px',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-2)' }}>
          Categorias da loja
        </Typography>
        <PillButton
          label="+ Nova categoria"
          onPress={() => {
            setRenaming(null);
            setName('');
            setFormOpen(true);
          }}
        />
      </Box>
      <Stack direction="row" spacing="6px" sx={{ flexWrap: 'wrap', rowGap: '6px' }}>
        {categories.map((category) => (
          <Box
            key={category.id}
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 12px',
              border: '1px solid var(--border-1)',
              borderRadius: '999px',
              background: 'var(--bg-app)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--fg-2)',
            }}
          >
            <Box
              component="button"
              type="button"
              aria-label={`Renomear ${category.name}`}
              onClick={() => {
                setRenaming(category);
                setName(category.name);
                setFormOpen(true);
              }}
              sx={{
                border: 0,
                background: 'none',
                padding: 0,
                font: 'inherit',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              {category.name}
            </Box>
            <Box
              component="span"
              sx={{
                padding: '1px 7px',
                borderRadius: '999px',
                background: 'var(--purple-100)',
                color: 'var(--purple-800)',
                fontSize: 9.5,
              }}
            >
              {category.productCount}
            </Box>
            <Box
              component="button"
              type="button"
              aria-label={`Remover ${category.name}`}
              disabled={busy}
              onClick={() => deleteCategory(category)}
              sx={{
                border: 0,
                background: 'none',
                color: 'var(--fg-4)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                fontSize: 12,
                fontWeight: 700,
                '&:hover': { color: 'var(--danger-500)' },
              }}
            >
              ×
            </Box>
          </Box>
        ))}
      </Stack>
      {formOpen ? (
        <Box sx={{ marginTop: '10px' }}>
          <Stack direction="row" spacing="8px" sx={{ alignItems: 'flex-end' }}>
            <Box sx={{ flex: 1 }}>
              <FormField
                label={renaming ? `Renomear ${renaming.name}` : 'Nova categoria'}
                value={name}
                onChangeText={setName}
                placeholder="Nome da categoria (ex. Nutrição)"
              />
            </Box>
            <TatameButton
              size="sm"
              label={renaming ? 'Salvar' : 'Criar'}
              loading={create.isPending || rename.isPending}
              onPress={submit}
            />
          </Stack>
          <Typography sx={{ fontSize: 10.5, color: 'var(--fg-4)', marginTop: '7px' }}>
            Categorias aparecem como filtro na loja do aluno e do professor. Só dá para
            remover categoria sem produtos.
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
}

/** UI seed for the tamanhos chips (spec 009); edits union the product's own. */
const DEFAULT_SIZE_CHIPS = ['P', 'M', 'G', 'GG'];

interface ProductSheetProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
  categories: StoreCategory[];
  /** Absent = create mode ("Novo produto"). */
  product?: AdminStoreProduct;
}

function ProductSheet({ onClose, onSuccess, categories, product }: ProductSheetProps) {
  const editing = product !== undefined;
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [priceText, setPriceText] = useState(
    product ? centsToInput(product.priceCents) : '',
  );
  const [stockText, setStockText] = useState(
    product ? String(product.stockQty) : '',
  );
  const [thresholdText, setThresholdText] = useState(
    String(product?.lowStockThreshold ?? 5),
  );
  const [categoryId, setCategoryId] = useState<string | null>(product?.categoryId ?? null);
  const [tagsText, setTagsText] = useState(product?.tags.join(', ') ?? '');
  const [sizes, setSizes] = useState<string[]>(product?.sizes ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const create = $api.useMutation('post', '/v1/admin/store/products');
  const update = $api.useMutation('patch', '/v1/admin/store/products/{id}');
  const archive = $api.useMutation('delete', '/v1/admin/store/products/{id}');
  const busy = create.isPending || update.isPending || archive.isPending;

  const sizeChips = [...new Set([...DEFAULT_SIZE_CHIPS, ...(product?.sizes ?? [])])];
  const tags = parseTagsInput(tagsText);
  const galleryMonogram = editing ? product.monogram : previewMonogram(name);
  const galleryPreset = product?.gradientPreset ?? 'store-blue-purple';

  function buildBody() {
    const next: Record<string, string> = {};
    const priceCents = parseBRLInput(priceText);
    const stockQty = /^\d+$/.test(stockText.trim()) ? Number(stockText.trim()) : null;
    const lowStockThreshold = /^\d+$/.test(thresholdText.trim())
      ? Number(thresholdText.trim())
      : null;
    if (name.trim().length < 2) next['name'] = 'Informe o nome do produto.';
    if (priceCents === null) next['price'] = 'Informe um preço válido, ex.: 389,00.';
    if (stockQty === null) next['stock'] = 'Informe o estoque em unidades inteiras.';
    if (lowStockThreshold === null) {
      next['threshold'] = 'Informe o limite de estoque baixo (0 ou mais).';
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || priceCents === null) return null;

    return {
      name: name.trim(),
      description: description.trim() === '' ? null : description.trim(),
      priceCents,
      stockQty: stockQty as number,
      lowStockThreshold: lowStockThreshold as number,
      categoryId,
      tags,
      sizes,
    };
  }

  function submit() {
    const body = buildBody();
    if (!body) return;
    const options = (message: string) => ({
      onSuccess: async () => {
        await invalidateStore();
        onSuccess(message);
        onClose();
      },
      onError: (error: unknown) => setApiError(storeErrorMessage(error)),
    });
    if (editing) {
      update.mutate(
        { params: { path: { id: product.id } }, body },
        options('Produto atualizado.'),
      );
    } else {
      create.mutate({ body }, options('Produto criado.'));
    }
  }

  function confirmArchive() {
    if (!product) return;
    setConfirmingArchive(false);
    archive.mutate(
      { params: { path: { id: product.id } } },
      {
        onSuccess: async () => {
          await invalidateStore();
          onSuccess('Produto removido da loja.');
          onClose();
        },
        onError: (error: unknown) => setApiError(storeErrorMessage(error)),
      },
    );
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={editing ? 'Editar produto' : 'Novo produto'}
      subtitle="Produto licenciado da loja da academia"
    >
      <Stack spacing="14px">
        <FormField
          label="Nome"
          value={name}
          onChangeText={setName}
          error={errors['name']}
          required
        />
        <FormField label="Descrição" value={description} onChangeText={setDescription} />
        <Stack direction="row" spacing="10px">
          <FormField
            label="Preço (R$)"
            value={priceText}
            onChangeText={setPriceText}
            placeholder="389,00"
            error={errors['price']}
            required
          />
          <FormField
            label="Estoque"
            value={stockText}
            onChangeText={setStockText}
            placeholder="12"
            error={errors['stock']}
            required
          />
        </Stack>
        <FormField
          label="Limite de estoque baixo"
          value={thresholdText}
          onChangeText={setThresholdText}
          error={errors['threshold']}
          helperText="O produto conta como “estoque baixo” quando o estoque fica igual ou abaixo deste número."
        />

        <Stack spacing="6px">
          <FormLabel sx={{ fontSize: 13, fontWeight: 600 }}>
            Categoria · gerencie na aba Produtos
          </FormLabel>
          <Stack direction="row" spacing="8px" sx={{ flexWrap: 'wrap', rowGap: '8px' }}>
            {categories.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                size="md"
                tone="brand"
                selected={categoryId === category.id}
                onPress={() =>
                  setCategoryId(categoryId === category.id ? null : category.id)
                }
              />
            ))}
          </Stack>
        </Stack>

        <FormField
          label="Tags"
          value={tagsText}
          onChangeText={setTagsText}
          placeholder="Tags de busca, separadas por vírgula (ex. kimono, a2, competição)"
        />
        {tags.length > 0 ? (
          <Stack direction="row" spacing="6px" sx={{ flexWrap: 'wrap', rowGap: '6px' }}>
            {tags.map((tag) => (
              <Chip key={tag} label={`#${tag}`} tone="brand" />
            ))}
          </Stack>
        ) : null}

        <Stack spacing="6px">
          <FormLabel sx={{ fontSize: 13, fontWeight: 600 }}>Tamanhos</FormLabel>
          <Stack direction="row" spacing="8px" sx={{ flexWrap: 'wrap', rowGap: '8px' }}>
            {sizeChips.map((size) => (
              <Chip
                key={size}
                label={size}
                size="md"
                tone="brand"
                selected={sizes.includes(size)}
                onPress={() =>
                  setSizes(
                    sizes.includes(size)
                      ? sizes.filter((entry) => entry !== size)
                      : [...sizes, size],
                  )
                }
              />
            ))}
          </Stack>
        </Stack>

        <Stack spacing="6px">
          <FormLabel sx={{ fontSize: 13, fontWeight: 600 }}>Galeria de fotos</FormLabel>
          <Stack direction="row" spacing="8px">
            <Box
              data-testid="gallery-cover"
              sx={{
                flex: 'none',
                width: 64,
                height: 64,
                borderRadius: '14px',
                position: 'relative',
                color: 'var(--white, #FFFFFF)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: '0.06em',
              }}
              style={{ background: storeGradientCss(galleryPreset) }}
            >
              {galleryMonogram}
              <Box
                component="span"
                sx={{
                  position: 'absolute',
                  bottom: 4,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  fontSize: 8.5,
                  fontWeight: 700,
                  letterSpacing: 0,
                }}
              >
                capa
              </Box>
            </Box>
            {[1, 2].map((slot) => (
              <Box
                key={slot}
                component="button"
                type="button"
                disabled
                aria-label={`Adicionar foto ${slot + 1} (em breve)`}
                sx={{
                  flex: 'none',
                  width: 64,
                  height: 64,
                  border: '1.5px dashed var(--purple-300)',
                  borderRadius: '14px',
                  background: 'var(--purple-50)',
                  color: 'var(--purple-ink)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                  fontFamily: 'inherit',
                  fontSize: 8.5,
                  fontWeight: 700,
                  opacity: 0.55,
                  cursor: 'default',
                }}
              >
                + Foto
              </Box>
            ))}
          </Stack>
          <Typography sx={{ fontSize: 10.5, color: 'var(--fg-4)', lineHeight: 1.5 }}>
            Upload de fotos chega em breve — por enquanto a capa é o monograma do produto
            sobre o gradiente da loja.
          </Typography>
        </Stack>

        {apiError ? <FormHelperText error>{apiError}</FormHelperText> : null}
        <TatameButton
          label={editing ? 'Salvar alterações' : 'Criar produto'}
          fullWidth
          loading={create.isPending || update.isPending}
          onPress={submit}
        />
        {editing ? (
          <TatameButton
            variant="danger"
            label="Remover da loja"
            fullWidth
            disabled={busy}
            onPress={() => setConfirmingArchive(true)}
          />
        ) : null}
      </Stack>

      {editing ? (
        <Dialog open={confirmingArchive} onClose={() => setConfirmingArchive(false)}>
          <DialogTitle>Remover da loja</DialogTitle>
          <DialogContent>
            <DialogContentText>
              O produto sai da vitrine e não pode mais ser comprado. Os pedidos que já
              referenciam este produto são preservados no histórico — nada é apagado.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmingArchive(false)}>Voltar</Button>
            <Button color="error" onClick={confirmArchive}>
              Remover
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </BottomSheet>
  );
}

/** The admin-05 sheet: item card + the four status options with descriptions. */
function OrderStatusSheet({
  order,
  onClose,
  onSuccess,
  onError,
}: {
  order: AdminStoreOrder;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const transition = $api.useMutation('post', '/v1/admin/store/orders/{id}/status');
  const options: Array<Exclude<StoreOrderStatus, 'pending'>> = [
    'paid',
    'ready',
    'delivered',
    'canceled',
  ];

  function apply(status: 'ready' | 'delivered' | 'canceled') {
    transition.mutate(
      { params: { path: { id: order.id } }, body: { status } },
      {
        onSuccess: async () => {
          await invalidateStore();
          onSuccess(
            status === 'canceled'
              ? `Pedido #${order.number} marcado como cancelado — estorno iniciado.`
              : `Pedido #${order.number} marcado como ${ORDER_STATUS_LABELS[status].toLowerCase()} — comprador notificado.`,
          );
          onClose();
        },
        onError: (error: unknown) => onError(storeErrorMessage(error)),
      },
    );
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Pedido #${order.number}`}
      subtitle={`${order.buyer.fullName} · pago via Pix`}
    >
      <Box
        sx={{
          padding: '14px 16px',
          borderRadius: '16px',
          background: 'var(--bg-app)',
          border: '1px solid var(--border-1)',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <Typography sx={{ fontSize: 13, color: 'var(--fg-2)' }}>
            {order.item ? orderItemLabel(order.item) : `Pedido #${order.number}`}
          </Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)' }}>
            {formatBRLWhole(order.totalCents)}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 11, color: 'var(--fg-4)', marginTop: '6px' }}>
          {order.pickupNote} · comprador é notificado a cada mudança de status
        </Typography>
      </Box>

      <Typography
        sx={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-2)', margin: '14px 0 8px' }}
      >
        Status do pedido
      </Typography>
      <Stack spacing="8px">
        {options.map((status) => {
          const current = order.status === status;
          const enabled = canTransition(order.status, status);
          return (
            <Box
              key={status}
              component="button"
              type="button"
              aria-label={ORDER_STATUS_LABELS[status]}
              disabled={!enabled || transition.isPending}
              onClick={() => {
                if (!enabled) return;
                if (status === 'canceled') {
                  setConfirmingCancel(true);
                } else if (status === 'ready' || status === 'delivered') {
                  apply(status);
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '13px 15px',
                border: current
                  ? '1.5px solid var(--purple-500)'
                  : '1.5px solid var(--border-1)',
                borderRadius: '16px',
                background: current ? 'var(--brand-tint)' : 'var(--bg-surface)',
                fontFamily: 'inherit',
                textAlign: 'left',
                cursor: enabled ? 'pointer' : 'default',
                opacity: enabled || current ? 1 : 0.5,
              }}
            >
              <Box
                component="span"
                aria-hidden
                sx={{ flex: 'none', width: 10, height: 10, borderRadius: '999px' }}
                style={{ background: ORDER_STATUS_DOTS[status] }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13, color: 'var(--fg-1)' }}>
                  {ORDER_STATUS_LABELS[status]}
                </Typography>
                <Typography sx={{ fontSize: 10.5, color: 'var(--fg-3)', marginTop: '1px' }}>
                  {ORDER_STATUS_DESCRIPTIONS[status]}
                </Typography>
              </Box>
              {current ? (
                <Box
                  component="span"
                  sx={{
                    flex: 'none',
                    padding: '3px 9px',
                    borderRadius: '999px',
                    background: 'var(--purple-100)',
                    color: 'var(--purple-800)',
                    fontSize: 9.5,
                    fontWeight: 700,
                  }}
                >
                  atual
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Stack>

      <Dialog open={confirmingCancel} onClose={() => setConfirmingCancel(false)}>
        <DialogTitle>Cancelar pedido</DialogTitle>
        <DialogContent>
          <DialogContentText>
            O valor pago será devolvido ao comprador — estorno do Pix em até 1 dia útil —
            e o item volta ao estoque da loja.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmingCancel(false)}>Voltar</Button>
          <Button
            color="error"
            onClick={() => {
              setConfirmingCancel(false);
              apply('canceled');
            }}
          >
            Cancelar pedido
          </Button>
        </DialogActions>
      </Dialog>
    </BottomSheet>
  );
}

export function LojaPage() {
  const toast = useToastState();
  const [tab, setTab] = useState<'produtos' | 'pedidos'>('produtos');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminStoreProduct | null>(null);
  const [viewingOrder, setViewingOrder] = useState<AdminStoreOrder | null>(null);

  const overviewQuery = $api.useQuery('get', '/v1/admin/store/overview');
  const categoriesQuery = $api.useQuery('get', '/v1/admin/store/categories');
  const productsQuery = $api.useQuery('get', '/v1/admin/store/products');
  const ordersQuery = $api.useQuery('get', '/v1/admin/store/orders');

  const overview = overviewQuery.data;
  const categories = categoriesQuery.data?.categories ?? [];
  const products = productsQuery.data?.products ?? [];
  // The board never shows unpaid orders (story 13) — defensive on the client.
  const orders = (ordersQuery.data?.orders ?? []).filter(
    (order) => order.status !== 'pending',
  );

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Loja da academia"
          subtitle="Produtos licenciados da equipe"
          trailing={
            <TatameButton size="sm" label="Novo produto" onPress={() => setCreating(true)} />
          }
        />

        {overview ? (
          <Stack direction="row" spacing="10px">
            <StatTile value={formatBRLWhole(overview.vendasMesCents)} label="vendas no mês" />
            <StatTile value={String(overview.pedidosMesCount)} label="pedidos no mês" />
            <StatTile
              value={String(overview.lowStock.count)}
              label="estoque baixo"
              warn={overview.lowStock.count > 0}
            />
          </Stack>
        ) : null}

        <SegmentedControl
          ariaLabel="Seções da loja"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'produtos', label: 'Produtos' },
            { value: 'pedidos', label: 'Pedidos' },
          ]}
        />

        {tab === 'produtos' ? (
          <>
            <CategoriesCard
              categories={categories}
              onError={toast.show}
              onSuccess={toast.show}
            />
            {products.length === 0 && !productsQuery.isLoading ? (
              <Card padding={4}>
                <EmptyState
                  title="Nenhum produto na loja"
                  description="Crie o primeiro produto licenciado pelo botão acima."
                />
              </Card>
            ) : (
              <Stack spacing="10px">
                {products.map((product) => (
                  <Box
                    key={product.id}
                    data-testid={`product-row-${product.id}`}
                    sx={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-1)',
                      borderRadius: '18px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <MonogramTile
                      monogram={product.monogram}
                      gradientPreset={product.gradientPreset}
                      testId={`product-tile-${product.id}`}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing="6px" sx={{ alignItems: 'center' }}>
                        <Typography
                          sx={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: 'var(--fg-1)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {product.name}
                        </Typography>
                        {product.categoryName ? (
                          <Chip label={product.categoryName} tone="brand" />
                        ) : null}
                      </Stack>
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontWeight: 600,
                          marginTop: '2px',
                          color: product.lowStock ? 'var(--warning-500)' : 'var(--fg-3)',
                        }}
                      >
                        {stockLine(product)}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 'none', textAlign: 'right' }}>
                      <Typography
                        sx={{ fontWeight: 700, fontSize: 13.5, color: 'var(--purple-ink)' }}
                      >
                        {formatBRLWhole(product.priceCents)}
                      </Typography>
                      <Box sx={{ marginTop: '4px' }}>
                        <PillButton
                          label="Editar"
                          ariaLabel={`Editar ${product.name}`}
                          onPress={() => setEditing(product)}
                        />
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </>
        ) : (
          <>
            {orders.length === 0 && !ordersQuery.isLoading ? (
              <Card padding={4}>
                <EmptyState
                  title="Nenhum pedido ainda"
                  description="Os pedidos pagos pelos alunos e professores aparecem aqui."
                />
              </Card>
            ) : (
              <Card padding={4}>
                {orders.map((order) => (
                  <ListRow
                    key={order.id}
                    title={`${order.buyer.fullName} · #${order.number}`}
                    subtitle={`${
                      order.item ? orderItemLabel(order.item) : 'Pedido'
                    } · ${formatBRLWhole(order.totalCents)} · Pix`}
                    leading={<InitialsAvatar name={order.buyer.fullName} />}
                    trailing={
                      order.status !== 'pending' ? (
                        <Chip
                          label={ORDER_STATUS_LABELS[order.status]}
                          tone={ORDER_STATUS_CHIP_TONES[order.status]}
                        />
                      ) : null
                    }
                    chevron
                    onPress={() => setViewingOrder(order)}
                  />
                ))}
              </Card>
            )}
          </>
        )}
      </Stack>

      {creating ? (
        <ProductSheet
          onClose={() => setCreating(false)}
          onSuccess={toast.show}
          categories={categories}
        />
      ) : null}
      {editing ? (
        <ProductSheet
          key={editing.id}
          onClose={() => setEditing(null)}
          onSuccess={toast.show}
          categories={categories}
          product={editing}
        />
      ) : null}
      {viewingOrder ? (
        <OrderStatusSheet
          key={viewingOrder.id}
          order={viewingOrder}
          onClose={() => setViewingOrder(null)}
          onSuccess={toast.show}
          onError={toast.show}
        />
      ) : null}

      <Toast open={toast.message !== null} message={toast.message ?? ''} onClose={toast.clear} />
    </Box>
  );
}

export default LojaPage;
