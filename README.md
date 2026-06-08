# Tower of Hanoi

ブラウザで動作する TypeScript 製のハノイの塔です。

## 起動

```sh
npm run start
```

ブラウザで `http://127.0.0.1:5173` を開きます。

GitHub Pages では以下から遊べます。

```text
https://keisuke71.github.io/towerofhanoi/
```

## テスト

```sh
npm test
```

## TypeScript の再ビルド

このリポジトリは `src/` に TypeScript、`dist/` に実行用 JavaScript を同梱しています。
`src/` を変更して `dist/` を再生成する場合は TypeScript をインストールしてから実行します。

```sh
npm install --save-dev typescript
npm run build
```
