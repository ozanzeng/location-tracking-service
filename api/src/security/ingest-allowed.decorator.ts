import { SetMetadata } from '@nestjs/common';

export const INGEST_ALLOWED = 'ingestAllowed';

/**
 * Sürücü (sadece konum gönderen) anahtarının da erişebildiği uç noktalar. Sürücü
 * uygulamasının anahtarı nginx arkasında olsa da o nginx'e erişen herkes kullanabilir;
 * bu yüzden yetkisi konum göndermek ve alan listesini okumakla sınırlıdır.
 */
export const IngestAllowed = () => SetMetadata(INGEST_ALLOWED, true);
