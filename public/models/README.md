# 3Dモデル(GLTF/GLB)置き場

ここに `.glb` ファイルを置き、`src/game/Items.ts` の対象アイテムに
`modelUrl: '/ARGame01/models/<ファイル名>.glb'` を指定すると、
プリミティブ形状の代わりにそのモデルが使われます（読み込み失敗時はプリミティブにフォールバック）。

例:
```ts
{ id: 'robot', ..., modelUrl: '/ARGame01/models/robot.glb' }
```
