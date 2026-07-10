import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface ArtifactDownloadUrlResolver {
  resolveDownloadUrl(artifactUri: string): Promise<string>;
}

export class PassthroughArtifactDownloadUrlResolver implements ArtifactDownloadUrlResolver {
  async resolveDownloadUrl(artifactUri: string): Promise<string> {
    return artifactUri;
  }
}

export class S3PresigningArtifactDownloadUrlResolver implements ArtifactDownloadUrlResolver {
  constructor(
    private readonly client: S3Client,
    private readonly ttlSeconds: number
  ) {}

  async resolveDownloadUrl(artifactUri: string): Promise<string> {
    if (!artifactUri.startsWith("s3://")) {
      return artifactUri;
    }

    const withoutScheme = artifactUri.slice("s3://".length);
    const slashIndex = withoutScheme.indexOf("/");
    if (slashIndex <= 0 || slashIndex === withoutScheme.length - 1) {
      return artifactUri;
    }

    const bucket = withoutScheme.slice(0, slashIndex);
    const key = withoutScheme.slice(slashIndex + 1);

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    return getSignedUrl(this.client, command, {
      expiresIn: this.ttlSeconds
    });
  }
}
