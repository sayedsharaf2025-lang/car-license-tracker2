package app.photoeditor.local;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;

/**
 * Saves an image (base64) into the phone gallery through MediaStore.
 * Android 10+ (API 29+): no storage permission is needed for files the app creates itself.
 * Older versions reject with code UNSUPPORTED so the JS side can fall back.
 */
@CapacitorPlugin(name = "MediaSaver")
public class MediaSaverPlugin extends Plugin {

    @PluginMethod
    public void saveImage(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("name");
        String mime = call.getString("mime", "image/png");
        String album = call.getString("album", "PhotoEditor");

        if (data == null || data.isEmpty() || name == null || name.isEmpty()) {
            call.reject("data and name are required", "BAD_ARGS");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("MediaStore saving needs Android 10 or newer", "UNSUPPORTED");
            return;
        }

        ContentResolver resolver = getContext().getContentResolver();
        Uri uri = null;
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);

            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            values.put(MediaStore.Images.Media.MIME_TYPE, mime);
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + album);
            values.put(MediaStore.Images.Media.IS_PENDING, 1);

            uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                call.reject("MediaStore insert returned null", "INSERT_FAILED");
                return;
            }

            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("openOutputStream returned null");
                out.write(bytes);
            }

            ContentValues done = new ContentValues();
            done.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, done, null, null);

            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            if (uri != null) {
                try { resolver.delete(uri, null, null); } catch (Exception ignored) { }
            }
            call.reject("Saving to gallery failed: " + e.getMessage(), "WRITE_FAILED", e);
        }
    }
}
