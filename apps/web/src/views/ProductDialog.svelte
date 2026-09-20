<script lang="ts">
  import Modal from '../components/Modal.svelte';
  import ProductForm from '../components/ProductForm.svelte';
  import { productDialog } from '../lib/stores/product-dialog.svelte.js';
  import ProductDetail from './ProductDetail.svelte';
</script>

{#if productDialog.view.kind !== 'closed'}
  {@const view = productDialog.view}
  <Modal
    title={view.kind === 'detail' ? view.product.title : 'New product'}
    onclose={() => productDialog.close()}
  >
    {#if view.kind === 'create'}
      <ProductForm
        onsubmit={(input) => productDialog.create(input)}
        oncancel={() => productDialog.close()}
      />
    {:else if view.kind === 'detail'}
      <ProductDetail
        product={view.product}
        status={productDialog.detailStatus}
        error={productDialog.detailError}
      />
    {/if}
  </Modal>
{/if}
