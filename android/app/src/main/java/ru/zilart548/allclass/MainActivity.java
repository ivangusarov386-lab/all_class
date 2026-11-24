package ru.zilart548.allclass;

import android.os.Bundle;
import android.util.Base64;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;
import java.io.IOException;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    private byte[] pendingCsv;

    // Preserve the existing CSV-template download without broad storage permissions.
    private final ActivityResultLauncher<String> saveCsv = registerForActivityResult(
        new ActivityResultContracts.CreateDocument("text/csv"), uri -> {
            byte[] content = pendingCsv;
            pendingCsv = null;
            if (uri == null || content == null) return;
            try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                if (output == null) throw new IOException("No output stream");
                output.write(content);
            } catch (IOException | SecurityException error) {
                Toast.makeText(this, "Не удалось сохранить шаблон CSV", Toast.LENGTH_LONG).show();
            }
        }
    );

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        if (state != null) pendingCsv = state.getByteArray("pendingCsv");
        getBridge().getWebView().setDownloadListener((url, agent, disposition, mime, length) -> {
            // Vite embeds the existing small CSV asset as a data URL.
            if (url == null || !url.startsWith("data:text/csv")) return;
            try {
                int comma = url.indexOf(',');
                if (comma < 0) throw new IllegalArgumentException("Invalid CSV data URL");
                String header = url.substring(0, comma);
                String body = url.substring(comma + 1);
                pendingCsv = header.endsWith(";base64")
                    ? Base64.decode(body, Base64.DEFAULT)
                    : URLDecoder.decode(body, "UTF-8").getBytes(StandardCharsets.UTF_8);
                saveCsv.launch("replacement-template.csv");
            } catch (Exception error) {
                pendingCsv = null;
                Toast.makeText(this, "Не удалось открыть сохранение шаблона CSV", Toast.LENGTH_LONG).show();
            }
        });
    }

    @Override
    public void onSaveInstanceState(Bundle state) {
        if (pendingCsv != null) state.putByteArray("pendingCsv", pendingCsv);
        super.onSaveInstanceState(state);
    }
}
