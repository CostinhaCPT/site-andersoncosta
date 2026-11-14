#!/bin/bash
# Publica no ar o que o GitHub Actions gerou no ramo "publicado".
# Roda no cron da Hostinger. Só copia e substitui arquivos: nada que existe
# apenas no servidor (como /anuncios, usado pelos anúncios da Meta) é apagado.
set -euo pipefail
DEST="$HOME/domains/andersoncostaimoveis.com.br/public_html"
REPO="CostinhaCPT/site-andersoncosta"
TMP="$HOME/.sync-site"

exec 9>"$HOME/.sync-site.lock"
flock -n 9 || exit 0

NOVA=$(curl -fsSL --max-time 30 "https://raw.githubusercontent.com/$REPO/publicado/versao.txt?t=$(date +%s)" | tr -d '[:space:]')
ATUAL=$(tr -d '[:space:]' < "$DEST/versao.txt" 2>/dev/null || true)
if [ -z "$NOVA" ] || [ "$NOVA" = "$ATUAL" ]; then exit 0; fi

rm -rf "$TMP"; mkdir -p "$TMP"
curl -fsSL --max-time 600 "https://codeload.github.com/$REPO/tar.gz/refs/heads/publicado" | tar -xz -C "$TMP" --strip-components=1
if [ ! -s "$TMP/index.html" ] || [ ! -s "$TMP/versao.txt" ] || [ ! -d "$TMP/_next" ] || [ ! -s "$TMP/imoveis/index.html" ]; then
  echo "$(date '+%F %T') pacote incompleto, nada publicado"; rm -rf "$TMP"; exit 1
fi
NOVA=$(tr -d '[:space:]' < "$TMP/versao.txt")

# 1) arquivos de apoio (scripts, estilos, fotos), 2) páginas, 3) versão por último
if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude='*.html' --exclude='*.txt' --exclude='sitemap.xml' "$TMP/" "$DEST/"
  rsync -a --exclude='versao.txt' "$TMP/" "$DEST/"
else
  (cd "$TMP" && find . -type f ! -name '*.html' ! -name '*.txt' ! -name 'sitemap.xml' -exec cp --parents -p {} "$DEST/" \;)
  (cd "$TMP" && find . -type f ! -name 'versao.txt' -exec cp --parents -p {} "$DEST/" \;)
fi
cp -p "$TMP/versao.txt" "$DEST/versao.txt"

# Limpa scripts antigos do Next.js que nenhuma página usa mais há mais de 7 dias
(cd "$DEST/_next" && find . -type f -mtime +7) | while IFS= read -r f; do
  [ -e "$TMP/_next/$f" ] || rm -f "$DEST/_next/$f"
done

rm -rf "$TMP"
echo "$(date '+%F %T') publicado $NOVA"
