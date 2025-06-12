"use client"

import {
  Toast,
  ToastProvider,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  return (
    <ToastProvider>
      <Toast />
      <ToastViewport />
    </ToastProvider>
  )
}
