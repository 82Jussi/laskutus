# Laskutus – rekisteröinnitön OneDrive-malli

Selainohjelma laskujen tekemiseen. Ei Microsoft-kirjautumista, Azurea eikä Client ID:tä.
Tiedostot kulkevat laitteen oman OneDrive-sovelluksen kautta, joten sama rekisteri ja samat laskut
ovat käytössä sekä tietokoneella että puhelimella.

## Tiedostot

| Tiedosto | Tehtävä |
|---|---|
| `index.html` | Käyttöliittymä |
| `styles.css` | Ulkoasu (Ruiskutuskeli-värit) |
| `config.js` | Asetukset (tallentuvat laitekohtaisesti selaimeen) |
| `storage.js` | Kansio- ja tiedostokäsittely, jako |
| `search.js` | Asiakas- ja tuotehaku |
| `invoice.js` | Summat, viitenumero, pankkiviivakoodi ja PDF |
| `app.js` | Ohjelman logiikka |
| `manifest.json`, `icon-*.png`, `apple-touch-icon.png`, `favicon-32.png` | Kotinäytön kuvake |

## OneDrive-kansio

```
OneDrive
└── Laskutus
    ├── Laskutus-rekisteri.xlsx
    ├── laskutus-tila.json        ← ohjelma luo (laskunumerot ja laskuloki)
    ├── logo.png                  ← valinnainen, nimi Laskuttajarekisteriin
    └── Laskut
        └── 2026
            └── Lasku_1001_Esimerkki Oy.pdf
```

## Tietokone (Edge tai Chrome)

1. Paina **Valitse Laskutus-kansio** ja valitse `C:\Users\<nimi>\OneDrive\Laskutus`.
2. Ohjelma muistaa kansion. Seuraavilla kerroilla selain voi pyytää vahvistuksen (**Salli kansion käyttö**).
3. **Tallenna lasku** kirjoittaa PDF:n kansioon `Laskut/vuosi`, ja OneDrive synkronoi sen.
4. Laskunumero ehdotetaan kansion laskujen ja `laskutus-tila.json`-tiedoston perusteella.

Firefox ei tue kansioon tallentamista – siinä ohjelma toimii puhelintilassa.

## Puhelin

1. **Valitse rekisteri-Excel** OneDrivesta (Android: ☰ → OneDrive, iPhone: Tiedostot → OneDrive).
   Rekisteri muistetaan laitteella; kun muutat rekisteriä, valitse se uudelleen.
2. **Tallenna lasku** avaa jakovalikon: valitse OneDrive ja kansio `Laskutus/Laskut/vuosi`.
3. **Jaa PDF** → sähköpostiohjelma: lasku liitteenä, vastaanottajat leikepöydällä.
4. Puhelin ei näe tietokoneen viimeisintä laskunumeroa – tarkista numero, jos laskutat molemmilla samana päivänä.

## Päivämäärät

Kentät ovat muodossa **pp.kk.vvvv** selaimen kieliasetuksista riippumatta. Kirjoita esim.
`5.12.2026`, `5.12.26` tai `051226` – ohjelma muotoilee arvon `05.12.2026`:ksi. Kalenterikuvakkeesta
saa valitsimen. Eräpäivän muuttaminen päivittää maksuehdon ja päinvastoin.

## Asiakas- ja tuotehaku

Asiakas ja tuote haetaan kirjoittamalla. Haku löytää osan nimestä, asiakasnumeron / tuotekoodin,
paikkakunnan tai Y-tunnuksen, ja useampi sana rajaa hakua (esim. `maija kauh`). ä ja a sekä ö ja o
samaistetaan. Jos tarkkaa osumaa ei ole, lista näyttää lähimmät (kirjoitusvirheet).

- **Enter** tai napautus valitsee, **↑ ↓** liikkuu listassa, **Esc** sulkee.
- Asiakaskentästä poistuttaessa valitaan lähin osuma automaattisesti.
- Tuotekentässä valinta täyttää yksikön, hinnan ja ALV:n ja siirtää kohdistuksen määrään.
  Jos et valitse listasta, teksti jää vapaaksi laskuriviksi.

## ALV-kannat

Laskurivien ALV valitaan alasvetovalikosta. Valikon kannat määritetään asetuksissa kohdassa
**Laskurivit → ALV-kannat** (oletus `25,5; 13,5; 10; 0`). Jos tuotteen ALV rekisterissä tai
laskuttajan oletus-ALV puuttuu listasta, se lisätään kyseisen rivin valikkoon, jotta arvo ei muutu huomaamatta.

## Ikkunakirjekuori (C5)

Vastaanottajan osoite on vasemmalla alueella x 22–88 mm, y 42–62 mm. Kun A4 taitetaan kerran
puoliksi ja laitetaan C5-ikkunakuoreen (162 × 229 mm), osoite näkyy sekä pienestä ikkunasta
(35 × 95 mm, 40 mm ylhäältä, 18 mm vasemmalta) että isosta ikkunasta (60 × 90 mm, 15 mm ylhäältä,
18 mm vasemmalta). Pitkä osoite rivitetään ja tarvittaessa fonttia pienennetään, jotta se pysyy alueella.
Tarkista ikkunan mitat käyttämästäsi kuoresta – ne vaihtelevat valmistajittain.

## Lasku (PDF)

- Asetuksissa: **Mustavalkoinen** (oletus) tai **Korostusväri** omalla värillä.
- Puuttuvat tiedot (esim. verkkolaskuosoite, toimituspäivä, toinen tili) jätetään kokonaan pois.
- Pitkät tekstit rivitetään tai fonttia pienennetään, joten tekstit eivät mene päällekkäin.
- **Pankkiviivakoodi** (Code 128 C, versio 4) ja sen alla **virtuaaliviivakoodi** tulostuvat, kun ensimmäinen
  tilinumero on FI-alkuinen IBAN ja valuutta euro. Yli 999 999,99 € summa koodataan nollina
  Pankkiviivakoodi-oppaan mukaisesti. Viivakoodin voi poistaa asetuksista.
- Oletusviestissä on virtuaaliviivakoodi (`{virtuaaliviivakoodi}`). Jos koodia ei voi muodostaa (esim. ulkomainen tili), rivi jätetään viestistä pois.
- *Teksti laskulle* on oletuksena tyhjä. Laskuttajarekisterin *Laskun vakioteksti* -kenttää ei käytetä automaattisesti.

## Tietoturva

GitHub Pagesissa on vain ohjelmakoodi. Rekisteri ja laskut ovat omassa OneDrivessasi ja käsitellään
vain omassa selaimessasi. Ohjelma näkee ainoastaan sen kansion tai tiedoston, jonka itse valitset.

## Julkaisu GitHub Pagesiin

1. Vie kaikki tiedostot repositorion juureen (korvaa vanhat, poista mahdollinen `graph.js`).
2. Settings → Pages → Deploy from branch → `main` / root.
3. Avaa `https://<käyttäjä>.github.io/<repo>/` tietokoneella ja puhelimella.

Paikallinen testaus: `python -m http.server 8000` → `http://localhost:8000`.
