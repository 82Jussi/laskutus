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
| `invoice.js` | Summat, viitenumero ja PDF |
| `app.js` | Ohjelman logiikka |
| `manifest.json`, `icon-*.png`, `apple-touch-icon.png`, `favicon-32.png` | Kotinäytön kuvake |

`graph.js` on poistettu – vanha tiedosto kannattaa poistaa myös GitHubista.

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

1. Avaa ohjelma ja paina **Valitse Laskutus-kansio**.
   Valitse `C:\Users\<nimi>\OneDrive\Laskutus` (tai vastaava).
2. Ohjelma lukee rekisterin ja muistaa kansion. Seuraavilla kerroilla selain voi pyytää
   vahvistuksen yhdellä painalluksella (**Salli kansion käyttö**).
3. **Tallenna lasku** kirjoittaa PDF:n suoraan kansioon `Laskut/vuosi`. OneDrive synkronoi sen.
4. Laskunumero ehdotetaan kansiossa olevien laskujen ja `laskutus-tila.json`-tiedoston perusteella,
   joten myös puhelimella tehdyt ja OneDriveen tallennetut laskut huomioidaan.

Firefox ei tue kansioon tallentamista – siinä ohjelma toimii puhelintilassa.

## Puhelin

1. Avaa ohjelma ja paina **Valitse rekisteri-Excel**. Valitse tiedosto OneDrivesta
   (Android: ☰ → OneDrive, iPhone: Tiedostot → OneDrive). Rekisteri muistetaan laitteella.
   Kun muutat rekisteriä, valitse se uudelleen Rekisteri-välilehdeltä.
2. **Tallenna lasku** avaa jakovalikon: valitse OneDrive ja kansio `Laskutus/Laskut/vuosi`.
3. **Jaa PDF** → valitse sähköpostiohjelma: lasku tulee liitteeksi, otsikko ja viesti valmiina.
   Vastaanottajat kopioituvat leikepöydälle – liitä ne Vastaanottaja-kenttään.
4. Laskunumero: puhelin muistaa omat laskunsa, mutta ei näe tietokoneen viimeisintä numeroa.
   Tarkista numero, jos laskutat samana päivänä molemmilla.

Kotinäytölle: Android Chrome ⋮ → *Lisää aloitusnäyttöön*, iPhone Safari Jaa → *Lisää Koti-valikkoon*.

## Sähköposti

- **Jaa PDF**: liite automaattisesti, vastaanottajat leikepöydältä (puhelin, Windowsin Edge/Chrome).
- **Avaa sähköposti**: vastaanottaja, kopiot, otsikko ja viesti valmiina; PDF liitetään itse.
- **Kopioi osoitteet**: kaikki laskun osoitteet leikepöydälle.

## Tietoturva

GitHub Pagesissa on vain ohjelmakoodi. Rekisteri ja laskut ovat omassa OneDrivessasi ja
käsitellään vain omassa selaimessasi. Ohjelma ei lähetä tietoja mihinkään palveluun.
Ohjelma näkee ainoastaan sen kansion tai tiedoston, jonka itse valitset.

## Julkaisu GitHub Pagesiin

1. Vie kaikki tiedostot repositorion juureen (poista vanha `graph.js`).
2. Settings → Pages → Deploy from branch → `main` / root.
3. Avaa `https://<käyttäjä>.github.io/<repo>/` tietokoneella ja puhelimella.

Paikallinen testaus: `python -m http.server 8000` → `http://localhost:8000`
(kansion valinta toimii vain https- tai localhost-osoitteessa).
