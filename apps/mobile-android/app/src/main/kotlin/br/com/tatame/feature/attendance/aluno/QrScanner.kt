package br.com.tatame.feature.attendance.aluno

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.ImageAnalysis
import androidx.camera.mlkit.vision.MlKitAnalyzer
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import br.com.tatame.R
import br.com.tatame.core.designsystem.theme.PillShape
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.tatame.designsystem.tokens.LumiraTokens

/**
 * QR scanning for the check-in sheet (ATT.19; ticket mobile-android/05):
 * CameraX [LifecycleCameraController] + ML Kit barcode (bundled model),
 * QR-only format filter, embedded via [AndroidView]. Degrades gracefully —
 * permission prompt before grant, textual fallback when the camera stack
 * fails (emulators, JVM previews); código/manual methods stay one tap away.
 * Debounce lives in the ViewModel (`submitting` gate), not here.
 */
@Composable
internal fun QrScannerPane(
    onQrScanned: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    var cameraFailed by remember { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> hasPermission = granted }

    when {
        cameraFailed -> ScannerMessage(text = stringResource(R.string.checkin_qr_unavailable))

        !hasPermission -> Column(
            modifier = modifier.fillMaxSize().padding(LumiraTokens.Space.S4),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(LumiraTokens.Space.S3, Alignment.CenterVertically),
        ) {
            Text(
                text = stringResource(R.string.checkin_qr_permission_body),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Button(
                onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                shape = PillShape,
            ) {
                Text(stringResource(R.string.checkin_qr_permission_cta))
            }
        }

        else -> {
            val lifecycleOwner = LocalLifecycleOwner.current
            AndroidView(
                modifier = modifier.fillMaxSize(),
                factory = { ctx ->
                    PreviewView(ctx).also { previewView ->
                        val bound = runCatching {
                            val executor = ContextCompat.getMainExecutor(ctx)
                            val scanner = BarcodeScanning.getClient(
                                BarcodeScannerOptions.Builder()
                                    .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                                    .build(),
                            )
                            val controller = LifecycleCameraController(ctx)
                            controller.setImageAnalysisAnalyzer(
                                executor,
                                MlKitAnalyzer(
                                    listOf(scanner),
                                    ImageAnalysis.COORDINATE_SYSTEM_ORIGINAL,
                                    executor,
                                ) { result ->
                                    result.getValue(scanner)
                                        ?.firstOrNull()
                                        ?.rawValue
                                        ?.let(onQrScanned)
                                },
                            )
                            controller.bindToLifecycle(lifecycleOwner)
                            previewView.controller = controller
                        }
                        if (bound.isFailure) cameraFailed = true
                    }
                },
                onRelease = { previewView ->
                    (previewView.controller as? LifecycleCameraController)?.unbind()
                },
            )
        }
    }
}

@Composable
private fun ScannerMessage(text: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(LumiraTokens.Space.S4),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}
