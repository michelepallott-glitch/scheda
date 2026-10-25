# Scheda

Web app (PWA) per tenere il diario di allenamento sull'iPhone: ognuno crea le proprie schede, segna le serie con il
timer di recupero e dopo ogni seduta riceve le proposte di progressione, che può accettare, rifiutare o correggere
scrivendo un carico suo. Funziona anche senza connessione e non ha account: i dati restano sul telefono di chi la usa.

## File

| File | Cosa contiene |
|---|---|
| `index.html` | struttura della pagina e collegamenti per l'installazione su iPhone |
| `stile.css` | grafica (chiaro/scuro automatico, pensata per il telefono) |
| `app.js` | tutta l'app: schede, registrazione, regole di progressione (`valuta`), storico, backup |
| `sw.js` | service worker per l'uso offline |
| `manifest.webmanifest`, `icone/` | nome e icone dell'app installata |

Non serve compilare niente: sono file statici.

## Provarla sul PC

```bash
python -m http.server 8770
```

Poi apri http://localhost:8770 nel browser.

## Pubblicarla (gratis)

Per installarla su iPhone deve stare su un indirizzo `https`. Il modo più semplice, senza programmi da installare:

1. Vai su https://app.netlify.com/drop (serve un account Netlify gratuito).
2. Trascina la cartella `Allenamento` nella pagina.
3. Netlify ti dà un indirizzo tipo `https://nome-a-caso.netlify.app`, che puoi rinominare dalle impostazioni del sito.

In alternativa: GitHub Pages, caricando questi file in un repository pubblico.

## Installarla sull'iPhone

Apri l'indirizzo in Safari → Condividi → **Aggiungi alla schermata Home**. Da lì si apre a schermo intero come un'app.

## Aggiornamenti

Quando cambi un file, aumenta `VERSIONE` in `sw.js` (es. `scheda-v2`) e ripubblica: i telefoni scaricano la nuova
versione la volta successiva che aprono l'app (la prima apertura mostra ancora la vecchia, la seconda la nuova).

## Dati e backup

I dati stanno nel `localStorage` del telefono (chiave `scheda-dati-v1`). Su iPhone, se l'app è aggiunta alla
schermata Home, iOS non li cancella da solo; se invece la si usa solo da Safari, possono sparire dopo settimane senza
aprirla. Per questo in **Altro** c'è il backup (file `.json` da salvare su iCloud Drive) e il ripristino.

## Regole di progressione

1. **Calibrazione**: se il carico è vuoto, quello usato la prima volta diventa il carico di partenza.
2. **Successo** (tutte le serie al massimo dell'intervallo): + aumento di carico, oppure variante successiva; si
   riparte dal minimo. All'ultima variante l'intervallo sale di 2.
3. **Nel mezzo**: stesso carico, +1 ripetizione nella serie più debole.
4. **Stallo** (una serie sotto il minimo) due sedute di fila: -10% del carico o variante precedente.
5. Serie incomplete o carico più basso del previsto: nessuna progressione.

Ogni modifica diventa una proposta: l'utente la applica così com'è, scrive un valore diverso o la rifiuta.
Le varianti valgono per lo stesso esercizio in tutte le sedute della scheda.
