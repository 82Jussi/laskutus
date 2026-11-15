/* template.js – tyhjä rekisteripohja (Rekisteri-välilehti → Lataa tyhjä rekisteripohja)
 *
 * Pohja muodostetaan ohjelman omista sarakenimistä, joten se on aina yhteensopiva
 * rekisterin luvun kanssa. Kaikki välilehdet ovat mukana; erityisominaisuuksien
 * välilehtiä ei tarvitse täyttää, jos ominaisuutta ei käytetä.
 * Kaavasarakkeita ei ole – ohjelma laskee tieyksiköt, hyötyalat ja osuudet itse.
 */
const TEMPLATE = {
  FILE: 'Laskutus-rekisteri-pohja.xlsx',

  sheets() {
    const tiekunta = [
      ['TIEYKSIKKÖLASKELMA / kunnossapito'],
      [],
      ['Tiekunta', ''],
      ['Tie / selitelmä', ''],
      ['Laskutusvuosi', new Date().getFullYear()],
      ['Laskentatapa', 'Kokonaisbudjetti', 'Kokonaisbudjetti tai Yksikköhinta'],
      ['Ositeltava summa (€)', ''],
      ['Yksikköhinta (€/tieyks.)', '', 'Vain laskentatavalla Yksikköhinta'],
      ['Perusmaksu (€ / maksaja)', '', 'Tyhjä = ei perusmaksua'],
      ['Perusmaksun teksti', 'Perusmaksu {vuosi}'],
      ['Ylläpitomaksun teksti', 'Tien ylläpitomaksu {vuosi}'],
      ['ALV %', 0],
      ['Laskun lisäteksti', ''],
      ['Vahvistettu', ''],
      [],
      ['Käytössä', 'Kiinteistö', 'Maksaja', 'Osoite', 'Postinumero', 'Postitoimipaikka', 'Sähköposti',
       'Tienkäyttöyksikkö', 'Liikennelaji', 'Yksiköiden lkm', 'Painoluku', 'Matka (km)',
       'Matkan korjauskerroin', 'Painoluvun korjauskerroin', 'Lisätieto']
    ];
    const ojitus = [
      ['OSITTELULASKELMA / kunnossapito'],
      [],
      ['Ojitusyhteisö', ''],
      ['Hanke', ''],
      ['Laskutusvuosi', new Date().getFullYear()],
      ['Laskurivin teksti', 'Kunnossapitomaksu {vuosi}'],
      ['ALV %', 0],
      ['Laskun lisäteksti', ''],
      [],
      ['Kuivatusalue', 'Laskutettava summa (€)', 'Selite'],
      [], [], [], [], [],
      [],
      ['Käytössä', 'Kuivatusalue', 'Kiinteistötunnus', 'Tilan nimi', 'Maksaja', 'Laskutusvastaanottaja',
       'Osoite', 'Postinumero', 'Postitoimipaikka', 'Sähköposti', 'Osittelukuvion numero',
       'Osittelukuvion tiluslaji', 'Osittelukuvion pinta-ala (ha)', 'Maanpinta', 'Vesipinta', 'Etäisyys (m)',
       'Maanarvojyvä', 'Kuivatusjyvä', 'Hyöty vastaa haittaa', 'mha-korjaus', 'Kiinteä osuus %',
       'Osuuden korjaus %', 'Vahvistettu osuus %', 'Lisätieto']
    ];
    const biller = [['Kenttä', 'Laskuttaja 1'],
      ['Saaja', ''], ['Myyjänro', ''], ['Lähiosoite', ''], ['Postinumero', ''], ['Postitoimipaikka', ''],
      ['Maa', 'Suomi'], ['Puhelin 1', ''], ['Puhelin 2', ''], ['Sähköposti', ''], ['Internet', ''],
      ['Pankki 1', ''], ['IBAN 1', ''], ['BIC 1', ''], ['Pankki 2', ''], ['IBAN 2', ''], ['BIC 2', ''],
      ['Y-tunnus', ''], ['ALV-numero', ''], ['Kaupparek. nro', ''], ['Maksuehto (pv)', 14],
      ['Viivästyskorko (%)', ''], ['Seuraava laskunumero', 1], ['Laskunumeron etuliite', ''],
      ['Oletusvaluutta', 'EUR'], ['Oletus-ALV (%)', 25.5], ['Laskun vakioteksti', ''], ['Logo tiedostonimi', '']];
    const ohje = [
      ['LASKUTUS – rekisteripohja'], [],
      ['Täytä vähintään Laskuttajarekisterin Saaja-rivi. Ohjelma lukee välilehdet ja sarakkeet nimen perusteella – älä muuta otsikoita.'],
      ['Uusia laskuttajia voi lisätä Laskuttajarekisteriin sarakkeisiin C, D, …'],
      [],
      ['Asiakasrekisteri – laskutettavat asiakkaat. Laskutussähköposti: ensimmäinen osoite on vastaanottaja, puolipisteellä erotetut seuraavat kopioita.'],
      ['Tuoterekisteri – tuotteet ja palvelut. Hinta verottomana, ALV prosentteina (esim. 25,5).'],
      ['Itselaskutus – yksi rivi per laskurivi, saajan tiedot toistetaan jokaisella rivillä.'],
      ['Tiekunta – yksi tiekunta per rekisteri. Yläosaan tiekunnan tiedot, alle tieyksikköluettelo (rivi per tienkäyttöyksikkö).'],
      ['Ojitusyhteisö – yksi ojitusyhteisö per rekisteri. Kuivatusalueet summataulukkoon, alle osittelulaskelma (rivi per kuvio). Vahvistettu osuus % täytetään tilan ensimmäiselle riville.'],
      ['Kirjeen vastaanottajat – massakirjeen vastaanottajat.'],
      [],
      ['Käytössä-sarake: tyhjä tai Kyllä = mukana, Ei = jätetään pois. Erityisominaisuuksien välilehdet voi jättää tyhjiksi, jos ominaisuutta ei käytetä.']
    ];
    return [
      ['Ohje', ohje, [130]],
      ['Asiakasrekisteri', [['Asiakasnumero', 'Nimi', 'Osoite', 'Postinumero', 'Postitoimipaikka', 'Maa', 'Y-tunnus',
        'Sähköposti', 'Maksuehto', 'Laskutusvastaanottaja', 'Laskutussähköposti', 'Verkkolaskuosoite', 'Välittäjä']],
        [13, 28, 24, 12, 17, 10, 12, 26, 10, 24, 36, 18, 16]],
      ['Tuoterekisteri', [['Tuotekoodi', 'Tuote', 'Yksikkö', 'Hinta, alv 0%', 'ALV']], [12, 44, 10, 14, 8]],
      ['Laskuttajarekisteri', biller, [26, 36]],
      ['Itselaskutus', [['Käytössä', 'Nimi', 'Osoite', 'Postinumero', 'Postitoimipaikka', 'Sähköposti', 'Tilinumero',
        'Selite', 'Määrä', 'Yksikkö', 'Hinta, alv 0%', 'ALV']], [10, 26, 24, 12, 16, 28, 26, 30, 8, 9, 14, 7]],
      ['Tiekunta', tiekunta, [26, 30, 28, 24, 12, 16, 28, 22, 11, 11, 10, 10, 12, 12, 30]],
      ['Ojitusyhteisö', ojitus, [24, 22, 16, 18, 28, 24, 24, 12, 16, 28, 11, 11, 11, 10, 10, 10, 10, 10, 11, 10, 10, 11, 11, 30]],
      ['Kirjeen vastaanottajat', [['Käytössä', 'Nimi', 'Laskutusvastaanottaja / c/o', 'Osoite', 'Postinumero',
        'Postitoimipaikka', 'Maa', 'Sähköposti', 'Lisätieto']], [10, 30, 28, 26, 12, 18, 10, 30, 30]]
    ];
  },

  build() {
    const wb = XLSX.utils.book_new();
    this.sheets().forEach(([name, aoa, widths]) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = widths.map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    return wb;
  },

  blob() {
    const out = XLSX.write(this.build(), { bookType: 'xlsx', type: 'array' });
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  },

  async download() {
    const st = (m, c) => { const el = $('tplStatus'); el.className = 'status ' + (c || ''); el.textContent = m || ''; };
    if (typeof XLSX === 'undefined' || !XLSX.write) { st('Excel-kirjastoa ei saatu ladattua. Tarkista verkkoyhteys.', 'err'); return; }
    try {
      const blob = this.blob();
      if (ST.mode === 'folder' && READY && (await ST.permission(true)) === 'granted') {
        let name = this.FILE, k = 1;
        while (await ST.exists(name)) name = this.FILE.replace(/\.xlsx$/, ` (${++k}).xlsx`);
        await ST.writeFile(name, blob);
        await listRegistryFiles();
        st(`✓ Tyhjä rekisteripohja tallennettu kansioon ${ST.folderName()}/${name}. Täytä se Excelissä, nimeä haluamallasi tavalla ja valitse rekisteritiedostoksi.`, 'ok');
      } else {
        ST.download(blob, this.FILE);
        st(`✓ ${this.FILE} ladattu. Tallenna se pilvikansioon (OneDrive, Google Drive tms.), täytä Excelissä ja valitse rekisteriksi.`, 'ok');
      }
    } catch (e) { st('Pohjan luonti epäonnistui: ' + e.message, 'err'); }
  },

  init() {
    const view = $('rekisteriView');
    if (!view) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="card-h">Uusi rekisteri</div>
      <p class="small">Lataa tyhjä rekisteripohja, jossa on kaikki välilehdet ja oikeat sarakeotsikot. Täytä ainakin Laskuttajarekisterin <b>Saaja</b>-rivi. Erillinen pohja kannattaa tehdä esimerkiksi jokaiselle tiekunnalle tai ojitusyhteisölle.</p>
      <div class="row-btns"><button type="button" class="btn ghost" id="btnTemplate">Lataa tyhjä rekisteripohja</button></div>
      <div id="tplStatus" class="status" aria-live="polite"></div>`;
    const cards = view.querySelectorAll(':scope > .card');
    view.insertBefore(card, cards[1] || null);
    $('btnTemplate').onclick = () => this.download();
  }
};
TEMPLATE.init();
