<template>
  <TooltipDialog
    v-if="data"
    :width="data.width || '624'"
    :tip-icon="data.icon"
    :show-cancel="data.showCancel"
    :show-close="data.showClose"
    :sub-tip="data.msg"
    :main-tip="data.title"
    :cancel="data.cancelText"
    :confirm="data.confirmText"
    @confirm="onConfirm"
    @close="onClose"
  />
</template>

<script setup lang="ts">
import TooltipDialog from '@/components/dialog/tooltip-dialog.vue'
import { data, onClose, onConfirm } from './index'
</script>
