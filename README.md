# Laskutus – rekisteröinnitön OneDrive-malli

Selainohjelma laskujen tekemiseen. Ei Microsoft-kirjautumista, Azurea eikä Client ID:tä.
Tiedostot: index.html, styles.css, config.js, storage.js, search.js, invoice.js, app.js, batch.js, letter.js, template.js, Laskutusrekisteripohja.xlsx,
manifest.json ja kuvakkeet. Rekisteri-Excel kuuluu OneDriven Laskutus-kansioon, ei GitHubiin.

## Tiekunnan laskutus (Asetukset → Erityisominaisuudet → Tiekunnan laskutus)

Yksi tiekunta per rekisteri. Useammalle tiekunnalle tehdään oma rekisteritiedosto ja valitaan
se Rekisteri-välilehdeltä.

Rekisterin **Tiekunta**-välilehti:
- Yläosa: Tiekunta, Tie / selitelmä, Laskutusvuosi, Laskentatapa (Kokonaisbudjetti / Yksikköhinta),
  Ositeltava summa, Yksikköhinta, Perusmaksu (€ / maksaja), Perusmaksun teksti, Ylläpitomaksun teksti,
  ALV %, Laskun lisäteksti, Vahvistettu. `{vuosi}` korvautuu laskutusvuodella.
- Tieyksikköluettelo (yksi rivi per tienkäyttöyksikkö): Käytössä, Kiinteistö, Maksaja, Osoite,
  Postinumero, Postitoimipaikka, Sähköposti, Tienkäyttöyksikkö, Liikennelaji,
  Yksiköiden lkm, Painoluku, Matka (km), Matkan korjauskerroin, Painoluvun korjauskerroin,
  (Tieyksiköt, Osuus %, Osittelu € – tarkistuskaavat), Lisätieto.
- Tieyksiköt = lkm × painoluku × matka × korjauskertoimet (tyhjä kerroin = 1). Ohjelma laskee tieyksiköt itse.

Laskutus:
- Jokainen maksaja saa yhden laskun: perusmaksu kerran ja ylläpitomaksu kiinteistöittäin
  (osuus = kiinteistön tieyksiköt / kaikki tieyksiköt × ositeltava summa, pyöristys senteiksi).
- Viitenumero muodostetaan aina laskunumerosta, joten pankkiviivakoodi tulostuu kaikille laskuille.
- Laskuttajaksi valitaan automaattisesti Laskuttajarekisterin laskuttaja, jonka Saaja on sama kuin tiekunnan nimi.
- Laskun lisäteksti tulee rekisteristä ja sitä voi muokata ohjelmassa ennen muodostusta.

### Ojitusyhteisön laskutus (Asetukset → Erityisominaisuudet → Ojitusyhteisön laskutus)

Yksi ojitusyhteisö per rekisteri. Rekisterin **Ojitusyhteisö**-välilehti:
- Yläosa: Ojitusyhteisö, Hanke, Laskutusvuosi, Laskurivin teksti, ALV %, Laskun lisäteksti.
- Kuivatusalueet: Kuivatusalue | Laskutettava summa (€) | Selite. Tyhjä tai 0 = aluetta ei laskuteta.
- Osittelulaskelma, yksi rivi per kuvio: maksajan tiedot, Osittelukuvion numero, Osittelukuvion tiluslaji,
  Osittelukuvion pinta-ala (ha), Maanpinta, Vesipinta, Etäisyys (m),
  Maanarvojyvä, Kuivatusjyvä, Hyöty vastaa haittaa, mha-korjaus sekä tilakohtaiset Kiinteä osuus %, Osuuden korjaus % ja
  Vahvistettu osuus % (tilan ensimmäiselle riville).
- Harmaat kaavat: Kuivatuslisä = max(0, (vesipinta + 1,4 + 0,002 × etäisyys − maanpinta) × 100), Hyötyluku = maanarvojyvä × kuivatusjyvä,
  mha = pinta-ala × hyötyluku (0 jos hyöty vastaa haittaa) + korjaus, tilan osuus = tilan mha / alueen mha × (100 − kiinteät osuudet) + korjaus.

Laskutus: tilan osuus = alueen summa × **Vahvistettu osuus %** / 100. Ohjelma laskee osuuden myös kuvioista ja varoittaa,
jos laskettu poikkeaa vahvistetusta. Jokainen maksaja saa yhden laskun kaikista tiloistaan ja alueistaan.

### Laskurivit ja kertalasku
- Määrä ja hinta kirjoitetaan pilkulla (esim. 85,84). Negatiivinen summa (hyvitys) kirjoitetaan miinusmerkillä
  tai rivin ±-painikkeella, jota voi käyttää myös puhelimen numeronäppäimistöllä.
- **Kertalaskun asiakas – ei rekisterissä**: asiakkaan tiedot kirjoitetaan suoraan laskulle eikä niitä tallenneta
  rekisteriin. Laskulle ei tule asiakasnumeroa.

#### Päivämäärävalitsin
Kalenteripainike avaa ohjelman oman kalenterin, jossa viikko alkaa maanantaista laitteen kieliasetuksesta riippumatta.

#### Tuotevalinta laskuriveillä
Tuotekentän napautus avaa koko tuoterekisterin selattavaksi (kuten Asiakas-kenttä). Kirjoitettu hakusana suodattaa listaa,
ja kirjoitettu teksti jää vapaaksi riviksi, jos listasta ei valita tuotetta.

##### Massakirje (Asetukset → Erityisominaisuudet → Massakirje)

Sama kirje tulostetaan jokaiselle rekisterin välilehden **Kirjeen vastaanottajat** vastaanottajalle
(Käytössä, Nimi, Laskutusvastaanottaja / c/o, Osoite, Postinumero, Postitoimipaikka, Maa, Sähköposti, Lisätieto).
Lähettäjä valitaan Laskuttajarekisteristä. Osoite osuu E5-ikkunakuoreen kuten laskuissa.
Viestissä **lihavointi**, rivin loppuun ___ = täyttöviiva. Muuttujat {nimi} {lisatieto} {pvm} {lahettaja}
{allekirjoittaja} {asema} {puhelin} {sahkoposti} {osoite}. Tuloksena yksi tulostettava PDF ja erilliset PDF:t
kansioon Laskut/vuosi/Kirjeet/otsikko. Ohjelmakoodi: letter.js.

## Rekisterin sarakkeet

Ohjelma lukee välilehdet ja sarakkeet niiden nimen perusteella (järjestys voi vaihdella, isot/pienet kirjaimet ja
välilyönnit eivät haittaa). Välilehtien nimet: Asiakasrekisteri, Tuoterekisteri, Laskuttajarekisteri, Itselaskutus,
Tiekunta, Ojitusyhteisö, Kirjeen vastaanottajat. Harmaat kaavasarakkeet ovat vain tarkistusta varten; ohjelma laskee
samat arvot itse. Vanhoja sarakenimiä ei tunnisteta.


### Pilvipalvelu ja uusi rekisteri

Ohjelma toimii minkä tahansa synkronoidun pilvikansion kanssa (OneDrive, Google Drive, Dropbox, iCloud Drive):
tietokoneella valitaan pilvipalvelun sovelluksen synkronoima kansio, puhelimella palvelu näkyy tiedostovalitsimessa,
kun sen sovellus on asennettu. Rekisterin on oltava .xlsx-tiedosto (ei Google Sheets -taulukko).

Rekisteri-välilehden **Lataa tyhjä rekisteripohja** lataa repositoriossa olevan tiedoston Laskutusrekisteripohja.xlsx
sellaisenaan (muotoilut, kaavat ja salasanasuojaukset säilyvät). Pohjan voi päivittää vaihtamalla tiedoston repositoriossa
samalla nimellä. Tietokoneella pohja tallentuu valittuun kansioon, puhelimella se ladataan laitteelle.
