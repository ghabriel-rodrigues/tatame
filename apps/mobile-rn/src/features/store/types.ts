/**
 * Local aliases over the generated contract for the store RN slice
 * (STO.10-11). Same pattern as the enrollment/billing/events slices —
 * aliased here until a shared alias bump.
 */

import type { ApiSchemas } from '@tatame/shared';

export type ProductCard = ApiSchemas['ProductCardDto'];
export type ProductDetail = ApiSchemas['ProductDetailDto'];
export type VitrineResponse = ApiSchemas['VitrineResponseDto'];
export type VitrineCategory = ApiSchemas['VitrineCategoryDto'];
export type StoreOrder = ApiSchemas['OrderDto'];
export type StoreOrderItem = ApiSchemas['OrderItemDto'];
export type StoreOrderStatus = StoreOrder['status'];
export type CreateOrderResponse = ApiSchemas['CreateOrderResponseDto'];
