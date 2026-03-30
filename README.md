# Palco Solo App — Player Profissional

Player profissional para músicos solo com controle de stems, ajuste de tom e velocidade em tempo real.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui (Radix UI) |
| Áudio | Tone.js (Web Audio API) |
| Estado | Zustand |
| Roteamento | React Router v6 |
| Dados | Mock local (Supabase — fase 2) |

---

## Instalação e execução

```bash
# 1. Instalar dependências
npm install

# 2. Rodar em desenvolvimento
npm run dev

# 3. Build de produção
npm run build

# 4. Preview do build
npm run preview
```

O app roda em `http://localhost:5173` por padrão.

---

## Conta demo

Para entrar no app (auth mockada):

| E-mail | Senha | Plano |
|---|---|---|
| demo@palcosolo.com | demo123 | Profissional |
| avancado@palcosolo.com | demo123 | Avançado |

---

## Estrutura do projeto

```
src/
├── audio/
│   └── AudioEngine.ts       ← Singleton de áudio (Tone.js)
├── components/
│   ├── layout/              ← AppLayout, Sidebar, MiniPlayer
│   ├── library/             ← TrackCard, SearchBar, GenreFilter
│   ├── player/              ← Controls, ProgressBar, PitchControl, SpeedControl, StemMixer
│   └── ui/                  ← shadcn/ui components
├── data/
│   ├── tracks.ts            ← Faixas mock (substituir por Supabase)
│   └── genres.ts            ← Gêneros musicais
├── pages/
│   ├── Auth.tsx             ← Login / Cadastro
│   ├── Library.tsx          ← Biblioteca de faixas
│   ├── PlayerPage.tsx       ← Player completo
│   ├── Performance.tsx      ← Modo palco
│   └── Settings.tsx         ← Configurações
├── store/
│   ├── playerStore.ts       ← Estado do player (Zustand)
│   └── authStore.ts         ← Auth mockada (Zustand + persist)
├── types/
│   ├── track.ts             ← Track, Stem, Genre, InstrumentId
│   └── player.ts            ← PlayerState, PlayerActions
└── lib/
    └── utils.ts             ← cn, formatTime, semitonesToLabel, etc.
```

---

## Arquitetura de áudio

```
Track.stems[] ──→ AudioEngine.load()
                       │
              Tone.Transport (master clock)
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
    Tone.Player   Tone.Player   Tone.Player  (1 por stem)
         │             │             │
    Tone.Gain     Tone.Gain     Tone.Gain    (mute/solo/volume)
         └─────────────┼─────────────┘
                       ▼
                Tone.PitchShift              (ajuste de tom)
                       │
                Tone.Gain (master)           (volume geral)
                       │
                AudioDestination
```

**Sincronização de stems:** Todos os `Tone.Player` são vinculados ao `Tone.Transport` via `.sync().start(0)`. Isso garante alinhamento sample-accurate — todos os stems iniciam, pausam e buscam na mesma posição exatamente.

**Pitch shift:** `Tone.PitchShift` usa Phase Vocoder para alteração independente de tom (não afeta a velocidade). Range: -12 a +12 semitons.

**Speed (time-stretch aproximado):** `Player.playbackRate` + compensação de pitch via `PitchShift`. Funciona bem para 0.8x a 1.3x. Para time-stretch profissional perfeito, a próxima fase integrará SoundTouch via AudioWorklet.

---

## Roteiro de melhorias futuras

### Fase 2 — Backend (Supabase)
- [ ] Substituir `authStore` mock por Supabase Auth
- [ ] Substituir `MOCK_TRACKS` por queries Supabase
- [ ] Supabase Storage para áudio (com CDN + range requests)
- [ ] Row Level Security por plano
- [ ] Webhook pós-compra (Greenn → Edge Function → user_plans)

### Fase 3 — Áudio profissional
- [ ] SoundTouch AudioWorklet para time-stretch perfeito
- [ ] Waveform visual com WaveSurfer.js
- [ ] Pré-contagem com clique/metrônomo
- [ ] Fade in/out configurável

### Fase 4 — Funcionalidades do músico
- [ ] Letra sincronizada (LRC / WebVTT)
- [ ] Set list (ordenar músicas para o show)
- [ ] Favoritos
- [ ] Histórico de reprodução
- [ ] Notas por música (tom que funciona, observações)

### Fase 5 — Admin
- [ ] Upload de faixas e stems
- [ ] Gerenciamento de metadados
- [ ] Controle de usuários e planos

### Fase 6 — Mobile nativo
- [ ] React Native / Expo para iOS e Android
- [ ] Modo offline com download
- [ ] Notificação de show

---

## Deploy

### Vercel (recomendado)
```bash
npm install -g vercel
vercel --prod
```

### Netlify
```bash
npm run build
# Drag & drop da pasta dist/ no painel Netlify
```

### Docker
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
```

---

## Variáveis de ambiente (Fase 2 — Supabase)

Copie `.env.example` para `.env` e preencha:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

---

## Licença

Propriedade de PowerTom / Palco Solo. Todos os direitos reservados.
