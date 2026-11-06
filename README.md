# Trip Drip

Praćenje troškova na putovanju. Za svako putovanje bilježiš troškove (datum, iznos, kategorija, bilješka) i vidiš statistiku po kategorijama.

Progresivna web aplikacija (PWA): nema servera ni prijave. Podaci ostaju **samo na tvom mobitelu**, a aplikacija radi i bez interneta.

## Objava na GitHub Pages

1. Na github.com napravi novi repozitorij, npr. `trip-drip` (može biti **Public**; GitHub Pages za privatne repozitorije traži plaćeni plan).
   Tvoji troškovi **nisu** u repozitoriju, u njemu je samo kod aplikacije.
2. Uploadaj ove datoteke u repozitorij (*Add file → Upload files*):
   - `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`
   - mapu `icons/` (sve datoteke u njoj)

   Mapu `.claude/` ne treba uploadati, ona služi samo za lokalno testiranje.
3. U repozitoriju: *Settings → Pages → Build and deployment → Source: Deploy from a branch*, branch `main`, mapa `/ (root)` → *Save*.
4. Za minutu-dvije aplikacija je na `https://TVOJE-KORISNIČKO-IME.github.io/trip-drip/`.

## Instalacija na iPhone

1. Otvori gornju adresu u **Safariju**.
2. Dodirni *Podijeli* (kvadrat sa strelicom) → **Dodaj na početni zaslon** → *Dodaj*.
3. Otvaraj aplikaciju uvijek preko ikone na početnom zaslonu. Tako radi i bez interneta.

> ⚠️ Podaci u aplikaciji na početnom zaslonu i u Safariju su odvojeni. Unosi troškove samo u aplikaciju s početnog zaslona.

## Kako se koristi

- **Putovanja**: `+` gore desno dodaje novo putovanje (naziv, od–do). Lista je poredana po datumu početka, najnovije prvo.
- **Trošak**: uđi u putovanje i dodirni plavi `+` dolje desno. Datum je današnji, ali ga možeš promijeniti. Iznos možeš upisati kao `12,50`, `12.50` ili `1.234,50`.
- **Uređivanje**: dodirni trošak da ga izmijeniš ili obrišeš. Olovka gore desno uređuje ili briše putovanje.
- **Statistika**: kartica *Statistika* prikazuje tortni grafikon i tablicu troškova po kategorijama.
- **Podjela troškova**: kartica *Podjela* u putovanju. Dodaj ljude (i sebe), a kod svakog troška biraj *Tko je platio* i *Za koga* (zadano se dijeli na jednake dijelove, a s *Točni iznosi* upisuješ koliko otpada na koga). Na vrhu kartice odmah piše *Tko kome duguje*, uz najmanji broj uplata, a *Podijeli* to šalje npr. u WhatsApp. Kad dugove riješite uživo, stisni *Podmiri*: gumb posivi i piše *Sve je podmireno*, a ti troškovi više ne ulaze u račun. Zadnje podmirenje možeš poništiti.
- **Kategorije**: *Postavke (ikona gore lijevo)*. Kategorije možeš dodavati, preimenovati, mijenjati im boju i redoslijed. Ako obrišeš kategoriju koja se već koristi, postojeći troškovi ostaju u statistici, ali se kategorija više ne nudi za nove unose.

## Sigurnosna kopija

*Postavke → Izvezi sigurnosnu kopiju*: spremi datoteku u Datoteke ili iCloud Drive.
Ako obrišeš aplikaciju ili promijeniš mobitel, podatke vraćaš s *Uvezi iz kopije*.

## Ažuriranje aplikacije

Kad promijeniš kod, u `sw.js` povećaj broj verzije (`tripdrip-v1` → `tripdrip-v2`) i ponovno uploadaj datoteke na GitHub. Mobitel će novu verziju preuzeti sljedeći put kad aplikaciju otvoriš s internetom (ponekad je treba zatvoriti i otvoriti dvaput).

## Lokalno testiranje (na Macu)

```bash
node .claude/serve.js
```
Zatim otvori http://localhost:8081
