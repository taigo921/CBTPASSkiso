# CBT問題集 PDF→JSON変換プロジェクト

## 役割
input/ に置いたCBT/歯科国試の問題集PDF（画像ベースが多い）を読み取り、
data/{開始}-{終了}.json に変換する。命名は元PDFのチャンク範囲に合わせる
（例: input/175_204pdf.pdf → data/175-204.json）。

## 読み取り手順
1. pdfinfo / pdffonts で確認。pdftotextが文字化け/空なら画像化して目視。
2. pypdfium2で全ページ画像化（scale=2.2。細かい歯式・図中文字はscale=4.5で部分拡大）。
3. 1ページずつビジョンで読み、問題文・選択肢・解説・正解を正確に転記。
4. json.dumps(..., ensure_ascii=False, indent=2) で出力。Pythonで組み立ててダンプ。

## 出力フォーマット（各問オブジェクト）
- uid: セクション略称(ハイフン抜き) + display_no（例 B-3→B3 → "B3-001"）
- display_no: ページ上の大きな番号（ゼロ埋め維持。セクションまたぎでリセットあり）
- section: セクション見出し（無いページは右端タブから判断）
- category: 問題番号下の小分類コード（閉じ括弧 ) まで含める。例 B-3-1)）
- subject: 解説欄「科目▶◯◯」をそのまま。毎問確認
- guide_ref: 解説欄「ガイド編▶ p.◯◯」
- has_image: 下記方針参照
- question: 問題文そのまま。図中の表・情報ボックスは中身もテキスト化して含める
- choices: {A..E}。4択ならDまで。組合せ問題もそのまま
- answer: 「正解◯」の記号（A〜E）。厚労省/公式正答を最優先
- explanation_intro: 解説冒頭の総括文（○✗より前の一文）。無ければ ""
- explanation: [{mark, labels, text}] の配列

## explanationルール
- mark: ○=正解, ✗=不正解 / labels: 対象の選択肢記号。複数はカンマ区切り
- 範囲は展開（✗A．C〜E → {"mark":"✗","labels":"A, C, D, E"}）
- ○✗混在は mark に両方（✗D．○E → {"mark":"✗○","labels":"D, E"}）

## has_image方針
必ずtrue：(ア)(イ)(ウ)/ア〜オ で図・地図・写真上の位置を問う、写真判別、グラフ・模式図・曲線。
表・情報ボックス（成分表・所見表・口腔内情報など）もtrue。
表・ボックスは同時にquestionへテキスト化（画像無しでも解けるハイブリッド）。

## image_base64 埋め込み（has_image:true は必須）
1. 該当ページを pypdfium2 で scale=4 描画
2. 図/写真/表の領域を切り出し（下端は気持ち広め）
3. 軽量化: 線画/表/地図/グラフ→減色PNG（im.quantize(colors=48), 幅上限~820px）。写真→JPEG(quality 80)
4. data:image/png;base64,...（写真は image/jpeg）にして該当uidの "image_base64" に格納
5. 1ファイル2〜3MB以内。切り出し後デコードして文字が読めるか目視確認

## 転記の注意
- 略字・英略語はそのまま（NO₂, SO₂, PMTC, ICDAS 等）
- 歯式は上下線+正中縦線を再現（結合上線 U+0305）。例 1̅|1̅
- 公式解答が教科書と違っても厚労省を優先。別説は解説内で「学術的には〜」と分離
- 誤植は原本忠実に転記のうえ最後に「誤植かも」と別途報告（勝手に直さない）

## アプリ連携
data/ にJSON追加後、必ず index.html の DATA_FILES 配列に新ファイル名を追記。
キャッシュバスティングは ?v=Date.now() を維持。

## 完成後の自己チェック（省略不可・一覧報告）
1. display_no の連番抜け（セクションまたぎリセット考慮）
2. uid のユニーク性
3. answer と explanation の ○ が一致
4. has_image:true の数と図・写真・表の問題数が一致
5. json.load で valid か検証
