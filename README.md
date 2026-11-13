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
| `batch.js` | Erityisominaisuudet: itselaskutus ja tiekunnan laskutus |
| `manifest.json`, `icon-*.png`, `apple-touch-icon.png`, `favicon-32.png` | Kotinäytön kuvake |

## OneDrive-kansio

```
OneDrive
└── Laskutus
    ├── Laskutus-rekisteri.xlsx
    ├── laskutus-tila.json        ← ohjelma luo (laskunumerot ja laskuloki)
    └── Laskut
        └── 2026
            ├── Lasku_1001_Esimerkki Oy.pdf
            ├── Itselaskutus
            │   └── Itselaskutus 11-2026
            │       ├── Itselaskutus_1002_Maija Meikäläinen.pdf
            │       └── yhteenveto.csv
            └── Tiekunnat
                └── Esimerkkitien tiekunta
                    ├── Lasku_TK-1_Esimerkki Oy.pdf
                    └── yhteenveto.csv
```

## Tietokone (Edge tai Chrome)

1. Paina **Valitse Laskutus-kansio** ja valitse `C:\Users\<nimi>\OneDrive\Laskutus`.
2. Ohjelma muistaa kansion. Seuraavilla kerroilla selain voi pyytää vahvistuksen (**Salli kansion käyttö**).
3. **Tallenna lasku** kirjoittaa PDF:n kansioon `Laskut/vuosi`, ja OneDrive synkronoi sen.

## Puhelin

1. **Valitse rekisteri-Excel** OneDrivesta. Rekisteri muistetaan laitteella.
2. **Tallenna lasku** avaa jakovalikon: valitse OneDrive ja kansio `Laskutus/Laskut/vuosi`.
3. **Jaa PDF** → sähköpostiohjelma: lasku liitteenä, vastaanottajat leikepöydällä.

## Kirjekuori: E5 (156 × 220 mm), ikkuna 30 × 90 mm

A4 taitetaan kerran puoliksi. Vastaanottajan osoite on alueella x 22–92 mm, y 41–61,5 mm.

## Erityisominaisuudet (Asetukset → Erityisominaisuudet)

### Itselaskutus

Rekisterin `Itselaskutus`-välilehti: **Käytössä | Nimi | Osoite | Postinumero | Postitoimipaikka |
Sähköposti | Tilinumero | Selite | Määrä | Yksikkö | Hinta, alv 0% | ALV**

- Saajan tiedot toistetaan jokaisella rivillä. Saman saajan (Nimi + Tilinumero) rivit tulevat yhdelle itselaskutukselle.
- Ostaja (laskun laatija) valitaan ohjelmassa Laskuttajarekisteristä koko erälle.
- PDF:n otsikko on *ITSELASKUTUS* ja tiedostonimi `Itselaskutus_<nro>_<saaja>.pdf`.
- Laskulle tulee vain käyttäjän kirjoittama lisäteksti – ohjelma ei lisää omaa tekstiä.
- Itselaskutuksesta ja laskun hyväksymismenettelystä on sovittava myyjän kanssa.

### Tiekunnan laskutus

- `Tiekunnat`: laskentatapa (Kokonaisbudjetti / Yksikköhinta), budjetti, yksikköhinta, perusmaksu, ALV.
- `Tiekuntaosakkaat`: osakaslista, tieyksiköt, muu maksu. Harmaat sarakkeet ovat tarkistuskaavoja.
- Laskuttajaksi valitaan tiekunta Laskuttajarekisteristä.

### Erän muodostus

1. Valitse laskuttaja, päivät ja tarkista ensimmäinen laskunumero.
2. Tarkista kortit. **Esikatsele** näyttää yksittäisen laskun.
3. **Muodosta kaikki** – tietokoneella PDF:t ja `yhteenveto.csv` eräkansioon; puhelimessa jakovalikkoon.
4. Lähetä kortin **Sähköposti**- tai **Jaa PDF** -painikkeella.

## Tietoturva

GitHub Pagesissa on vain ohjelmakoodi. Rekisteri ja laskut ovat omassa OneDrivessasi.

## Julkaisu GitHub Pagesiin

Vie kaikki ohjelmatiedostot (ei rekisteri-Exceliä) repositorion juureen ja ota Pages käyttöön.
