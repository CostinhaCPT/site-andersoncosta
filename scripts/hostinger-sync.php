<?php
// Publica no ar o que o GitHub Actions gerou no ramo "publicado".
// Roda pelo cron da Hostinger: /usr/bin/php .../public_html/_sync-site.php
// Só copia e substitui arquivos: nada que existe apenas no servidor
// (como /anuncios, usado pelos anúncios da Meta) é apagado.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
set_time_limit(0);
ini_set('memory_limit', '512M');

$DEST = __DIR__;                       // public_html
$BASE = dirname(__DIR__);              // pasta do domínio, fora do site
$REPO = 'CostinhaCPT/site-andersoncosta';
$TMP  = $BASE . '/.sync-site';
$LOG  = $BASE . '/sync-site.log';

function registrar($msg) {
  global $LOG, $DEST;
  $linha = date('Y-m-d H:i:s') . ' ' . $msg;
  @file_put_contents($LOG, $linha . "\n", FILE_APPEND);
  @file_put_contents($DEST . '/sync-status.txt', $linha . "\n");
}
function baixar($url, $destino = null) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 600, CURLOPT_USERAGENT => 'site-sync']);
  if ($destino) { $fp = fopen($destino, 'wb'); curl_setopt($ch, CURLOPT_FILE, $fp); }
  else { curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); }
  $r = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if (isset($fp)) fclose($fp);
  return $code === 200 ? ($destino ? true : $r) : false;
}
function apagarPasta($p) {
  if (!is_dir($p)) return;
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($p, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
  foreach ($it as $f) { $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname()); }
  @rmdir($p);
}
function copiar($origem, $destino, $filtro) {
  $n = 0;
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($origem, FilesystemIterator::SKIP_DOTS));
  foreach ($it as $f) {
    if (!$f->isFile()) continue;
    $rel = substr($f->getPathname(), strlen($origem) + 1);
    if (!$filtro($rel)) continue;
    $alvo = $destino . '/' . $rel;
    if (!is_dir(dirname($alvo))) mkdir(dirname($alvo), 0755, true);
    if (is_file($alvo) && filesize($alvo) === $f->getSize() && md5_file($alvo) === md5_file($f->getPathname())) continue;
    if (!copy($f->getPathname(), $alvo . '.novo') || !rename($alvo . '.novo', $alvo)) throw new Exception("falha ao copiar $rel");
    $n++;
  }
  return $n;
}

$trava = fopen($BASE . '/.sync-site.lock', 'c');
if (!flock($trava, LOCK_EX | LOCK_NB)) exit;

try {
  $nova = trim((string) baixar("https://raw.githubusercontent.com/$REPO/publicado/versao.txt?t=" . time()));
  $atual = trim((string) @file_get_contents($DEST . '/versao.txt'));
  if ($nova === '' || $nova === $atual) exit;

  apagarPasta($TMP);
  mkdir($TMP, 0755, true);
  $tgz = $TMP . '/pacote.tar.gz';
  if (!baixar("https://codeload.github.com/$REPO/tar.gz/refs/heads/publicado", $tgz)) throw new Exception('download falhou');
  (new PharData($tgz))->decompress();
  (new PharData($TMP . '/pacote.tar'))->extractTo($TMP . '/x', null, true);
  $pastas = glob($TMP . '/x/*', GLOB_ONLYDIR);
  $SRC = $pastas[0] ?? '';
  foreach (['index.html', 'versao.txt', 'imoveis/index.html'] as $obrig) {
    if (!is_file("$SRC/$obrig") || filesize("$SRC/$obrig") === 0) throw new Exception("pacote incompleto: falta $obrig");
  }
  $nova = trim(file_get_contents("$SRC/versao.txt"));
  $ehPagina = function ($r) { return (bool) preg_match('/\.(html|txt|xml)$/', $r); };

  // 1) arquivos de apoio, 2) páginas, 3) versão por último
  $a = copiar($SRC, $DEST, function ($r) use ($ehPagina) { return !$ehPagina($r) && $r !== '.htaccess'; });
  $b = copiar($SRC, $DEST, function ($r) use ($ehPagina) { return ($ehPagina($r) || $r === '.htaccess') && $r !== 'versao.txt'; });
  copy("$SRC/versao.txt", "$DEST/versao.txt");

  // scripts antigos do Next.js que nenhuma página usa mais há mais de 7 dias
  $lim = 0;
  if (is_dir("$DEST/_next")) {
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$DEST/_next", FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
      $rel = substr($f->getPathname(), strlen($DEST) + 1);
      if ($f->isFile() && !is_file("$SRC/$rel") && $f->getMTime() < time() - 7 * 86400) { @unlink($f->getPathname()); $lim++; }
    }
  }
  apagarPasta($TMP);
  registrar("publicado $nova ($a arquivos de apoio, $b páginas, $lim antigos removidos)");
} catch (Throwable $e) {
  apagarPasta($TMP);
  registrar('erro: ' . $e->getMessage());
}
