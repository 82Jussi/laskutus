/* template.js – rekisteripohja (Rekisteri-välilehti → Lataa tyhjä rekisteripohja)
 *
 * Ladattava pohja on valmis Excel-tiedosto Laskutusrekisteripohja.xlsx, joka on
 * julkaistu ohjelman kanssa samaan kansioon (GitHub Pages). Tiedosto kopioidaan
 * sellaisenaan (tavu tavulta), joten sen muotoilut, kaavat, kommentit ja
 * salasanasuojaukset säilyvät. Pohjaa päivitetään vaihtamalla tiedosto repositoriossa.
 */
const TEMPLATE = {
  SRC: 'Laskutusrekisteripohja.xlsx',     // tiedosto palvelimella
  FILE: 'Laskutusrekisteripohja.xlsx',    // tallennettavan tiedoston nimi

  async blob() {
    const res = await fetch(this.SRC, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`pohjaa ei löytynyt palvelimelta (${res.status})`);
    const buf = await res.arrayBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  },

  async download() {
    const st = (m, c) => { const el = $('tplStatus'); el.className = 'status ' + (c || ''); el.textContent = m || ''; };
    try {
      st('Haetaan pohjaa…', 'work');
      const blob = await this.blob();
      if (ST.mode === 'folder' && READY && (await ST.permission(true)) === 'granted') {
        let name = this.FILE, k = 1;
        while (await ST.exists(name)) name = this.FILE.replace(/\.xlsx$/, ` (${++k}).xlsx`);
        await ST.writeFile(name, blob);
        await listRegistryFiles();
        st(`✓ Rekisteripohja tallennettu kansioon ${ST.folderName()}/${name}. Täytä se Excelissä, nimeä haluamallasi tavalla ja valitse rekisteritiedostoksi.`, 'ok');
      } else {
        ST.download(blob, this.FILE);
        st(`✓ ${this.FILE} ladattu. Tallenna se pilvikansioon (OneDrive, Google Drive tms.), täytä Excelissä ja valitse rekisteriksi.`, 'ok');
      }
    } catch (e) { st('Pohjan lataus epäonnistui: ' + e.message + '. Tarkista verkkoyhteys.', 'err'); }
  },

  init() {
    const view = $('rekisteriView');
    if (!view) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="card-h">Uusi rekisteri</div>
      <p class="small">Lataa rekisteripohja, jossa on kaikki välilehdet, oikeat sarakeotsikot ja esimerkkirivit. Korvaa esimerkit omilla tiedoillasi ja täytä ainakin Laskuttajarekisterin <b>Saaja</b>-rivi. Erillinen rekisteri kannattaa tehdä esimerkiksi jokaiselle tiekunnalle tai ojitusyhteisölle.</p>
      <div class="row-btns"><button type="button" class="btn ghost" id="btnTemplate">Lataa tyhjä rekisteripohja</button></div>
      <div id="tplStatus" class="status" aria-live="polite"></div>`;
    const cards = view.querySelectorAll(':scope > .card');
    view.insertBefore(card, cards[1] || null);
    $('btnTemplate').onclick = () => this.download();
  }
};
TEMPLATE.init();
