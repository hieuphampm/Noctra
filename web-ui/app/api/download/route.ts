import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ASSETS: Record<string, { fileKey: string; filename: string }> = {
  "android-apk": {
    fileKey: "noctra-ai/v1.0.0/noctra-ai-release.apk",
    filename: "noctra-ai-release.apk",
  },
  "windows-nsis": {
    fileKey: "noctra-studio/v0.1.0/NOCTRA-STUDIO_0.1.0_x64-setup.exe",
    filename: "NOCTRA-STUDIO_0.1.0_x64-setup.exe",
  },
  "windows-msi": {
    fileKey: "noctra-studio/v0.1.0/NOCTRA-STUDIO_0.1.0_x64_en-US.msi",
    filename: "NOCTRA-STUDIO_0.1.0_x64_en-US.msi",
  },
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const assetKey = request.nextUrl.searchParams.get("asset");
  if (!assetKey || !(assetKey in ALLOWED_ASSETS)) {
    return NextResponse.json(
      { error: "Unknown or unavailable release asset." },
      { status: 404 }
    );
  }

  const keyId = process.env.B2_KEY_ID?.trim();
  const applicationKey = process.env.B2_APPLICATION_KEY?.trim();

  if (!keyId || !applicationKey) {
    return NextResponse.json(
      {
        error:
          "Download storage credentials are not configured on this server (B2_KEY_ID / B2_APPLICATION_KEY).",
      },
      { status: 503 }
    );
  }

  const asset = ALLOWED_ASSETS[assetKey];

  try {
    const basicAuth = Buffer.from(`${keyId}:${applicationKey}`).toString(
      "base64"
    );
    const authResponse = await fetch(
      "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
        cache: "no-store",
      }
    );

    if (!authResponse.ok) {
      return NextResponse.json(
        { error: "Unable to authorize storage download." },
        { status: 502 }
      );
    }

    const authData = (await authResponse.json()) as {
      apiUrl: string;
      downloadUrl: string;
      authorizationToken: string;
      allowed?: {
        bucketId?: string;
        bucketName?: string;
      };
    };

    const bucketId =
      process.env.B2_BUCKET_ID?.trim() || authData.allowed?.bucketId;
    const bucketName =
      process.env.B2_BUCKET_NAME?.trim() ||
      authData.allowed?.bucketName ||
      "Noctra";

    if (!bucketId) {
      return NextResponse.json(
        { error: "Backblaze bucket ID could not be resolved." },
        { status: 500 }
      );
    }

    const disposition = `attachment; filename="${asset.filename}"`;

    const signResponse = await fetch(
      `${authData.apiUrl}/b2api/v2/b2_get_download_authorization`,
      {
        method: "POST",
        headers: {
          Authorization: authData.authorizationToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bucketId,
          fileNamePrefix: asset.fileKey,
          validDurationInSeconds: 300,
          b2ContentDisposition: disposition,
        }),
        cache: "no-store",
      }
    );

    if (!signResponse.ok) {
      return NextResponse.json(
        { error: "Unable to generate signed download authorization." },
        { status: 502 }
      );
    }

    const signData = (await signResponse.json()) as {
      authorizationToken: string;
    };

    const targetUrl = new URL(
      `${authData.downloadUrl}/file/${encodeURIComponent(bucketName)}/${asset.fileKey}`
    );
    targetUrl.searchParams.set("Authorization", signData.authorizationToken);
    targetUrl.searchParams.set("b2ContentDisposition", disposition);

    return NextResponse.redirect(targetUrl.toString(), {
      status: 302,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unexpected error preparing download redirect." },
      { status: 500 }
    );
  }
}
