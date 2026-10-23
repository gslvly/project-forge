<template>
  <Teleport to="body">
    <div class="tooltip-dialog">
      <div
        class="tooltip-dialog-main"
        :style="{ width: width.includes('px') ? width : width + 'px' }"
      >
        <el-icon class="close" :size="18" v-if="showClose" @click="emitClose">
          <Close />
        </el-icon>
        <div class="t-body">
          <el-icon :size="48" v-if="tipIcon === 'element-confirm'" class="body-icon confirm-icon">
            <QuestionFilled />
          </el-icon>
          <el-icon :size="48" v-else-if="tipIcon === 'element-delete'" class="body-icon delete-icon">
            <DeleteFilled />
          </el-icon>
          <Icon v-else-if="tipIcon" :name="tipIcon" class="body-icon" />
          <div class="body-tip">
            <div v-if="mainTip" class="main-tip" v-html="mainTip"></div>
            <slot v-else name="mainTip"></slot>
            <div class="sub-tip" v-if="subTip" v-html="subTip"></div>
            <slot v-else name="subTip"></slot>
          </div>
        </div>
        <div class="address-list" v-if="address">
          <div class="arr-card" v-for="it in address" :key="it" v-tip="it">
            {{ `${it.substring(0, 6)}...${it.slice(-4)}` }}
          </div>
        </div>
        <div class="t-footer">
          <el-button v-if="showCancel" class="default" type="default" @click="emitClose">
            {{ cancel }}
          </el-button>
          <el-button class="primary" :loading="loading" type="primary" @click="emitConfirm">
            {{ confirm }}
          </el-button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ElIcon } from 'element-plus';
import { Close, DeleteFilled, QuestionFilled } from '@element-plus/icons-vue'
import Icon from '../icon.vue';
const props = withDefaults(
  defineProps<{
    confirm?: string
    cancel?: string
    width?: string
    tipIcon?: string
    mainTip?: string
    subTip?: string

    showCancel?: boolean
    showClose?: boolean
    loading?: boolean
    address?: string[]
  }>(),
  {
    width: '500px',
    confirm: '确认',
    cancel: '取消',
    showCancel: true,
    showClose: true
  }
)

const emit = defineEmits(['close', 'confirm'])

const emitClose = () => emit('close')
const emitConfirm = () => emit('confirm')
</script>

<style lang="scss">
.tooltip-dialog {
  position: fixed;
  right: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 99999;
  background-color: rgb(0 0 0 / 30%);
  .tooltip-dialog-main {
    position: relative;
    margin-top: 15vh;
    left: 50%;
    transform: translateX(-50%);
    background-color: #ffffff;
    box-shadow: 0 8px 16px 0 rgba(0, 11, 32, 0.15);
    border-radius: 6px;
    padding: 32px;
    box-sizing: border-box;
    .close {
      position: absolute;
      right: 16px;
      top: 16px;
      font-size: 16px;
      cursor: pointer;
      color: #66738c;
    }
    .close:hover {
      color: var(--main-color);
    }
    .t-body {
      display: flex;
      .body-icon {
        width: 48px;
        height: 40px;
        margin-right: 16px;

        &.confirm-icon {
          color: var(--el-color-primary);
        }

        &.delete-icon {
          color: var(--el-color-danger);
        }
      }
      .body-tip {
        width: calc(100% - 64px);
        word-wrap: break-word;

        .main-tip {
          font-size: 20px;
          font-weight: 600;
          color: #001640;
          line-height: 28px;
        }
        .sub-tip {
          margin-top: 8px;
          font-size: 16px;
          font-weight: 400;
          color: #334566;
          line-height: 28px;
        }
      }
    }
    .address-list {
      display: flex;
      margin: 0 0 16px 64px;
      flex-wrap: wrap;

      .arr-card {
        width: 132px;
        flex-shrink: 0;
        height: 32px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #f5f8fb;
        box-sizing: border-box;
        border-radius: 4px;
        padding: 4px 8px;
        color: #334566;
        font-weight: 500;
        font-size: 13px;
        margin-right: 8px;
        margin-bottom: 8px;

        div {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }
    }
    .t-footer {
      display: flex;
      width: 100%;
      margin-top: 24px;
      justify-content: flex-end;
    }
  }
}
</style>
