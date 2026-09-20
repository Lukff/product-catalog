<script lang="ts">
  import Modal from '../components/Modal.svelte';
  import ProductForm from '../components/ProductForm.svelte';
  import { productDialog, type DialogView } from '../lib/stores/product-dialog.svelte.js';
  import ProductDeleteConfirm from './ProductDeleteConfirm.svelte';
  import ProductDetail from './ProductDetail.svelte';

  function titleFor(view: Exclude<DialogView, { kind: 'closed' }>): string {
    switch (view.kind) {
      case 'create':
        return 'New product';
      case 'detail':
        return view.product.title;
      case 'edit':
        return `Edit ${view.product.title}`;
      case 'delete':
        return 'Delete product';
    }
  }
</script>

{#if productDialog.view.kind !== 'closed'}
  {@const view = productDialog.view}
  <Modal title={titleFor(view)} onclose={() => productDialog.close()}>
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
        onedit={() => productDialog.openEdit()}
        ondelete={() => productDialog.openDelete()}
      />
    {:else if view.kind === 'edit'}
      <ProductForm
        product={view.product}
        onsubmit={(input) => productDialog.update(input)}
        oncancel={() => productDialog.backToDetail()}
      />
    {:else if view.kind === 'delete'}
      <ProductDeleteConfirm
        product={view.product}
        status={productDialog.deleteStatus}
        error={productDialog.deleteError}
        onconfirm={() => void productDialog.remove()}
        oncancel={() => productDialog.backToDetail()}
      />
    {/if}
  </Modal>
{/if}
