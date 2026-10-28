package com.planmaker.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;

/** PlanMaker para Android: la app web dentro de un WebView. */
public class MainActivity extends Activity {
    private static final String HOME = "https://appassets.androidplatform.net/assets/index.html";
    private static final int PICK_FILE = 1;
    private static final int SAVE_FILE = 2;

    private WebView web;
    private ValueCallback<Uri[]> pendingPick;
    private Uri photoUri;
    private byte[] pendingSave;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);

        // Sirve la app desde un origen https para que funcionen los módulos, el almacenamiento y la API.
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingPick != null) pendingPick.onReceiveValue(null);
                pendingPick = callback;
                photoUri = null;
                Intent intent;
                if (params.isCaptureEnabled()) {
                    intent = cameraIntent();
                } else {
                    intent = new Intent(Intent.ACTION_GET_CONTENT)
                            .addCategory(Intent.CATEGORY_OPENABLE)
                            .setType("image/*")
                            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                                    params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                    intent = Intent.createChooser(intent, "Elegir imagen");
                }
                try {
                    startActivityForResult(intent, PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingPick = null;
                    toast("No hay una app para abrir imágenes o la cámara.");
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "PlanMakerAndroid");

        if (state != null) web.restoreState(state);
        else web.loadUrl(HOME);
    }

    private Intent cameraIntent() {
        try {
            File dir = new File(getCacheDir(), "fotos");
            dir.mkdirs();
            File f = File.createTempFile("foto", ".jpg", dir);
            photoUri = FileProvider.getUriForFile(this, "com.planmaker.app.files", f);
        } catch (IOException e) {
            photoUri = null;
        }
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (photoUri != null) {
            intent.putExtra(MediaStore.EXTRA_OUTPUT, photoUri);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        }
        return intent;
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && pendingPick != null) {
            Uri[] uris = null;
            if (result == RESULT_OK) {
                if (photoUri != null) {
                    uris = new Uri[] { photoUri };
                } else if (data != null && data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    uris = new Uri[n];
                    for (int i = 0; i < n; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data != null && data.getData() != null) {
                    uris = new Uri[] { data.getData() };
                }
            }
            pendingPick.onReceiveValue(uris);
            pendingPick = null;
        } else if (request == SAVE_FILE) {
            byte[] bytes = pendingSave;
            pendingSave = null;
            if (result != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                out.write(bytes);
                toast("Archivo guardado.");
            } catch (IOException | NullPointerException e) {
                toast("No se pudo guardar el archivo.");
            }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show());
    }

    /** Funciones que la página llama para guardar archivos e imprimir. */
    private class Bridge {
        @JavascriptInterface
        public void save(String name, String mime, String base64) {
            pendingSave = Base64.decode(base64, Base64.DEFAULT);
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime)
                    .putExtra(Intent.EXTRA_TITLE, name);
            runOnUiThread(() -> {
                try {
                    startActivityForResult(intent, SAVE_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingSave = null;
                    toast("No se pudo abrir el selector para guardar.");
                }
            });
        }

        @JavascriptInterface
        public void print(String name) {
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                pm.print(name, web.createPrintDocumentAdapter(name), null);
            });
        }
    }
}
