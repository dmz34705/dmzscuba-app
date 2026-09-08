package com.dmzscuba.colorcamera

import android.content.Context
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.views.ExpoView
import expo.modules.kotlin.viewevent.EventDispatcher

class ColorLossCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ColorLossCamera")
    View(ColorLossCameraView::class) {
      Events("onCameraError", "onCameraReady")
      Prop("matrix") { view: ColorLossCameraView, values: List<Double> -> view.updateMatrix(values) }
    }
  }
}

class ColorLossCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onCameraError by EventDispatcher()
  private val onCameraReady by EventDispatcher()
  private val previewView = PreviewView(context).apply {
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    scaleType = PreviewView.ScaleType.FILL_CENTER
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
  }
  private var provider: ProcessCameraProvider? = null
  private var preview: Preview? = null
  private var paint = Paint()
  init {
    addView(previewView)
    previewView.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> applyPaint(previewView) }
  }

  fun updateMatrix(values: List<Double>) {
    if (values.size != 20 || values.any { !it.isFinite() }) return
    val nativeValues = values.mapIndexed { i, value -> (value * if (i % 5 == 4) 255 else 1).toFloat() }.toFloatArray()
    paint = Paint().apply { colorFilter = ColorMatrixColorFilter(ColorMatrix(nativeValues)) }
    applyPaint(previewView)
  }

  private fun applyPaint(view: View) {
    if (view is TextureView) view.setLayerPaint(paint)
    if (view is ViewGroup) for (i in 0 until view.childCount) applyPaint(view.getChildAt(i))
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    val owner = appContext.currentActivity as? LifecycleOwner
    if (owner == null) { onCameraError(mapOf("message" to "Camera lifecycle is unavailable.")); return }
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (!isAttachedToWindow) return@addListener
      try {
        provider = future.get()
        preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
        provider!!.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview!!)
        previewView.previewStreamState.observe(owner) { state ->
          if (state == PreviewView.StreamState.STREAMING && isAttachedToWindow) {
            applyPaint(previewView)
            onCameraReady(emptyMap<String, Any>())
          }
        }
      } catch (error: Exception) { onCameraError(mapOf("message" to (error.message ?: "The camera could not start."))) }
    }, ContextCompat.getMainExecutor(context))
  }

  override fun onDetachedFromWindow() {
    (appContext.currentActivity as? LifecycleOwner)?.let { previewView.previewStreamState.removeObservers(it) }
    preview?.let { provider?.unbind(it) }
    preview = null
    super.onDetachedFromWindow()
  }
}
