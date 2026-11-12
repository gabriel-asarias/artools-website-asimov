# ARTOOLS Pigmentum 0.1 — página de produto

> Página de produto **conceitual** para a caneta técnica ARTOOLS Pigmentum 0.1, criada como projeto de estudo do curso **Webdesign com IA — Asimov Academy**.

**[Ver online →](#)** <!-- trocar pelo link da Vercel -->

![Prévia do site](assets/img/og-cover.jpg)

## Destaques

| Dobra | O que acontece |
| --- | --- |
| **01 · Hero** | Vídeo em tela cheia controlado pelo scroll (estilo páginas da Apple). No fim, uma linha de tinta sai da ponta da caneta, seguindo a trajetória real medida quadro a quadro. |
| **02 · A ponta** | Colagem com quadros do vídeo, curvas de nível desenhadas com traços de 0.1 mm e contadores animados. |
| **03 · A tinta** | Capítulo escuro com uma **folha de teste interativa**: desenhe com o mouse ou o dedo, veja a tinta secar em 2 s e derrame água para comparar com a tinta comum. Inclui uma lente de microscopia com partículas em tempo real. |
| **04 · Especificações** | Desenho técnico que se constrói e se desmonta em **vista explodida** com o scroll, ligado a uma tabela de componentes. |
| **05 · Comprar** | Seletor de kits com total animado e rodapé com um último traço de tinta. |

Todas as dobras têm animações de entrada, saída e parallax, e respeitam `prefers-reduced-motion`.

## Stack

- HTML, CSS e JavaScript puros, sem etapa de build
- [GSAP 3.13](https://gsap.com/) — ScrollTrigger, SplitText e DrawSVG
- [Lenis 1.1.13](https://lenis.darkroom.engineering/) — scroll suave
- Fontes: Inter, Instrument Serif e Geist Mono (Google Fonts)

Todas as bibliotecas são carregadas por CDN, com versões fixas.

## Estrutura

```
├── index.html              # a página
├── css/main.css            # estilos (tokens do design system em :root)
├── js/main.js              # interações e animações
├── assets/
│   ├── video/              # vídeo da hero
│   └── img/                # posters, recortes do vídeo e imagem de compartilhamento
├── design-system/          # design system "Monólito" usado como base visual
├── vercel.json
└── README.md
```

## Rodando localmente

O vídeo precisa ser servido por HTTP (via `file://` o seek pode falhar):

```bash
npx serve .
```

Abra o endereço exibido no terminal (por padrão `http://localhost:3000`).

### Modo debug

- `/?debug` mostra um painel com o progresso do scroll, o quadro do vídeo e uma mira na ponta da caneta.
- `/?debug&p=1` abre a página direto no fim da hero (`p` vai de `0` a `1`).

Para recalibrar a ponta, clique sobre ela no vídeo: o painel mostra as coordenadas prontas para colar nas constantes `PEN_TIP_X` e `PEN_TIP_Y`, no topo de `js/main.js`.

## Deploy

Site estático: na Vercel, importe o repositório com o preset **Other**, sem comando de build e com o diretório raiz `.`. O `vercel.json` ativa URLs limpas e o cache dos arquivos de `assets/`.

Depois do primeiro deploy, troque o `og:image` do `index.html` pela URL absoluta (por exemplo, `https://seu-projeto.vercel.app/assets/img/og-cover.jpg`), para a prévia aparecer ao compartilhar o link.

## Aviso

Projeto **educacional**, sem fins comerciais. Preços, especificações técnicas, prazos e políticas exibidos são **fictícios**.
