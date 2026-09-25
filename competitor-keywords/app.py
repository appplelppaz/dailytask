"""競合商品 検索キーワード分析 — 画面(Streamlit)。

起動: Windows は start.bat をダブルクリック。
"""

from __future__ import annotations

from datetime import datetime
from urllib.parse import urlparse

import altair as alt
import pandas as pd
import streamlit as st

from analyzer import compare, config, export
from analyzer import pipeline as P
from analyzer.csv_import import read_keyword_csv
from analyzer.dataforseo import DataForSEO
from analyzer.page import canonical_url
from analyzer.serper import Serper

BAR_COLOR = "#2a78d6"

st.set_page_config(page_title="競合商品 検索キーワード分析", page_icon="👠", layout="wide")

settings = config.load_settings()
has_dfs = bool(settings.get("dataforseo_login") and settings.get("dataforseo_password"))
has_serper = bool(settings.get("serper_key"))
has_ai = bool(settings.get("anthropic_key"))


# ---------------------------------------------------------------------------
# サイドバー: 現在のモード・設定・履歴
# ---------------------------------------------------------------------------
with st.sidebar:
    st.header("現在の構成")
    if has_dfs:
        st.success("DataForSEO: 設定済み\n\n競合URLの順位付きキーワードを外部DBから取得します(従量課金)")
    else:
        st.info("DataForSEO: 未設定\n\n無料モードで動きます(ページ内容とGoogleサジェストから候補を作成)")
    st.write(("✅" if has_serper else "➖") + " Serper(実際の検索順位の確認): " + ("設定済み" if has_serper else "未設定"))
    st.write(("✅" if has_ai else "➖") + " Claude(AI分類・考察): " + ("設定済み" if has_ai else "未設定"))

    with st.expander("⚙️ 設定(APIキー)", expanded=not (has_dfs or has_serper)):
        st.caption("キーはこのPCの data/settings.json にだけ保存されます。すべて任意です。")
        s_new = dict(settings)
        s_new["dataforseo_login"] = st.text_input("DataForSEO ログイン(メールアドレス)", settings.get("dataforseo_login", ""))
        s_new["dataforseo_password"] = st.text_input("DataForSEO API パスワード", settings.get("dataforseo_password", ""),
                                                     type="password",
                                                     help="app.dataforseo.com の API Access に表示されるパスワード")
        s_new["serper_key"] = st.text_input("Serper API キー", settings.get("serper_key", ""), type="password",
                                            help="serper.dev で無料登録すると2,500回分使えます")
        s_new["anthropic_key"] = st.text_input("Claude API キー(任意)", settings.get("anthropic_key", ""),
                                               type="password")
        s_new["ai_model"] = st.text_input("AIモデル", settings.get("ai_model", "claude-opus-5"),
                                          help="費用を抑えたい場合は claude-haiku-4-5 なども指定できます")
        if st.button("保存", type="primary"):
            config.save_settings(s_new)
            st.success("保存しました")
            st.rerun()
        if has_dfs and st.button("DataForSEO の残高を確認"):
            bal = DataForSEO(settings["dataforseo_login"], settings["dataforseo_password"]).balance()
            st.write(f"残高: ${bal:.2f}" if bal is not None else "残高を取得できませんでした")

    st.header("過去の分析")
    runs = config.list_runs()
    if runs:
        pick = st.selectbox("開く", runs, format_func=lambda p: p.stem, index=None, placeholder="選択してください")
        if pick is not None and st.button("この結果を開く"):
            st.session_state["run"] = config.load_run(pick)
            st.rerun()
    else:
        st.caption("まだありません")


# ---------------------------------------------------------------------------
# 入力の解釈
# ---------------------------------------------------------------------------
def parse_products(text: str) -> list[tuple[str, str, bool]]:
    """各行「URL」または「名前, URL」。返り値: (名前, URL, 名前が自動か)"""
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        label, url = "", line
        for sep in ("\t", ",", "、", " "):
            if sep in line and "http" in line.split(sep, 1)[1]:
                label, url = line.split(sep, 1)
                break
        url = url.strip()
        if not url.startswith("http"):
            continue
        auto = not label.strip()
        out.append((label.strip() or urlparse(url).netloc, url, auto))
    # 名前の重複を避ける
    seen: dict[str, int] = {}
    uniq = []
    for i, (label, url, auto) in enumerate(out, 1):
        name = f"{i:02d} {label}" if auto else label
        seen[name] = seen.get(name, 0) + 1
        uniq.append((name if seen[name] == 1 else f"{name} ({seen[name]})", url, auto))
    return uniq


def short_title(p: P.ProductResult) -> str | None:
    if not p.page or not p.page.ok:
        return None
    t = (p.page.product_name or p.page.h1 or p.page.title).strip()
    for sep in ("|", "｜", " - ", "："):
        t = t.split(sep)[0].strip() or t
    return t[:24] or None


# ---------------------------------------------------------------------------
# 画面
# ---------------------------------------------------------------------------
st.title("競合商品 検索キーワード分析")
st.caption("競合商品のURLから、その商品ページがどんな検索キーワードと結びついているかを調べます。"
           "順位・検索ボリューム・推定クリックはすべて出典と信頼度つきで表示します。")

tab_in, tab_prod, tab_cmp, tab_mkt, tab_help = st.tabs(
    ["① 分析する", "② 商品別", "③ 競合比較", "④ 市場の検索需要", "⑤ データの見方"])

with tab_in:
    urls_text = st.text_area(
        "競合商品のURL(1行に1つ。10〜100件OK)",
        height=200,
        placeholder="https://example.com/item/123\nA社 幅広パンプス, https://example.com/item/456",
        help="「名前, URL」の形で書くと、結果に好きな名前で表示されます",
    )
    products = parse_products(urls_text)

    with st.expander("📄 Ahrefs / Semrush などのCSVを取り込む(任意)"):
        st.caption("既に Ahrefs 等で書き出した「Organic keywords」CSVがあれば、それを分類・比較に使えます。"
                   "その商品は外部APIを使わないので追加費用はかかりません。")
        files = st.file_uploader("CSVファイル", type=["csv", "tsv", "txt"], accept_multiple_files=True)
        imported: dict[str, tuple[pd.DataFrame, str]] = {}
        for f in files or []:
            try:
                df_imp, src = read_keyword_csv(f.getvalue(), f.name)
            except Exception as e:  # noqa: BLE001 - 読み込めないCSVは画面で知らせる
                st.error(f"{f.name}: 読み込めませんでした({e})")
                continue
            if "url" in df_imp.columns and df_imp["url"].notna().any():
                for u, g in df_imp.groupby(df_imp["url"].map(canonical_url)):
                    imported[u] = (g, src)
                st.write(f"{f.name}: {src}形式・{len(df_imp)}行(URL列あり)")
            elif products:
                target = st.selectbox(f"{f.name} はどの商品のデータですか?", [p[1] for p in products], key=f.name)
                imported[canonical_url(target)] = (df_imp, src)
            else:
                st.warning(f"{f.name}: URL列が無いので、先に上の欄に対象商品のURLを入力してください")
        if imported:
            # CSV にしか無い URL も分析対象に加える
            known = {canonical_url(u) for _, u, _ in products}
            for u, (g, src) in imported.items():
                if u not in known:
                    full = g["url"].dropna().iloc[0] if "url" in g.columns and g["url"].notna().any() else "https://" + u
                    products.append((f"{len(products) + 1:02d} {urlparse(full).netloc}", full, True))

    with st.expander("詳細設定"):
        c1, c2, c3 = st.columns(3)
        opt = P.Options()
        opt.max_rank = c1.select_slider("何位までを対象にするか", [10, 20, 30, 50, 100], value=50)
        opt.dfs_limit = c1.select_slider("DataForSEO: 1商品の最大キーワード数", [100, 200, 300, 500, 1000], value=300,
                                         help="多いほど費用が少し増えます(1000件で約$0.13/商品)")
        opt.serp_depth = c2.select_slider("Serper: 何位まで確認するか", [10, 20, 30, 50], value=20,
                                          help="10位ごとに1クレジット")
        opt.max_candidates = c2.slider("無料モード: 1商品の候補キーワード数", 5, 60, 25)
        opt.verify_top = c2.slider("DataForSEOの上位何件をSerperで実測確認するか", 0, 50, 10 if has_serper else 0,
                                   disabled=not (has_dfs and has_serper))
        opt.use_suggest = c3.checkbox("Googleサジェストで候補を広げる(無料モード)", True)
        opt.fetch_pages = c3.checkbox("商品ページの内容を取得する(関連性の判定に使用)", True)
        reuse = c3.checkbox("保存済みの取得結果を再利用する(費用節約)", True)
        opt.cache_days = 30 if reuse else 0
        use_ai_cls = c3.checkbox("辞書で分類できないキーワードをAIで分類", has_ai, disabled=not has_ai)

    n = len(products)
    n_api = sum(1 for _, u, _ in products if canonical_url(u) not in imported)
    est = []
    if has_dfs and n_api:
        est.append(f"DataForSEO 最大 約${n_api * (0.012 + 0.00012 * opt.dfs_limit):.2f}(保存済みのURLは0円)")
    if has_serper and n_api:
        per = (opt.verify_top if has_dfs else opt.max_candidates) * (opt.serp_depth // 10)
        est.append(f"Serper 最大 約{n_api * per}クレジット(同じキーワードは商品間で共有)")
    st.write(f"**対象: {n}商品**" + ("  /  費用の目安: " + "、".join(est) if est else "  /  外部の有料APIは使いません"))

    if st.button("🔍 分析開始", type="primary", disabled=n == 0):
        dfs = DataForSEO(settings["dataforseo_login"], settings["dataforseo_password"]) if has_dfs else None
        serper = Serper(settings["serper_key"]) if has_serper else None
        with st.status("分析中…", expanded=True) as status:
            bar = st.progress(0.0)
            done = {"n": 0}

            def log(msg: str) -> None:
                st.write(msg)

            results, errors = [], []
            for label, url, auto in products:
                rs, errs = P.run([(label, url)], opt, dfs, serper, imported, log)
                p = rs[0]
                if auto and (t := short_title(p)):
                    new = f"{label.split(' ')[0]} {t}"
                    p.label = new
                    for r in p.rows:
                        r["product"] = new
                results.append(p)
                errors += errs
                done["n"] += 1
                bar.progress(done["n"] / n)
            ai_cats = {}
            if use_ai_cls and has_ai:
                todo = P.unclassified_keywords(results)
                if todo:
                    st.write(f"AIで{len(todo)}件のキーワードを分類中…")
                    try:
                        from analyzer.ai import classify_keywords
                        ai_cats = classify_keywords(settings["anthropic_key"], todo,
                                                    settings.get("ai_model") or "claude-opus-5")
                    except Exception as e:  # noqa: BLE001 - AIは補助なので失敗しても結果は出す
                        errors.append(f"AI分類: {e}")
            df = P.finalize_rows(results, ai_cats)
            cost = []
            if dfs:
                cost.append(f"DataForSEO 実費 ${dfs.spent:.3f}")
            if serper:
                cost.append(f"Serper {serper.credits_used}クレジット")
            run = {"results": results, "df": df, "created": datetime.now().strftime("%Y-%m-%d %H:%M"),
                   "errors": errors, "cost": "、".join(cost), "ai_memo": None}
            name = results[0].label if results else "run"
            config.save_run(f"{n}商品_{name}", run)
            st.session_state["run"] = run
            status.update(label="分析完了", state="complete", expanded=False)
        for e in errors:
            st.error(e)
        st.success("完了しました。上の「② 商品別」「③ 競合比較」「④ 市場の検索需要」タブで結果を見られます。"
                   + (f"(今回の費用: {run['cost']})" if run["cost"] else ""))

run = st.session_state.get("run")


def need_run() -> bool:
    if not run:
        st.info("まだ結果がありません。「① 分析する」でURLを入力して分析してください。")
        return True
    return False


def include_toggle(key: str) -> bool:
    """比較・需要マップに「候補(未確認)」を含めるか。確認済みの行が無いときは含めるのが初期値。"""
    df = run["df"]
    has_found = bool(len(df)) and bool(df["found"].any())
    has_cand = bool(len(df)) and bool((~df["found"]).any())
    if not has_cand:
        return False
    inc = st.toggle("順位を確認していない「候補」も含める", value=not has_found, key=key,
                    help="候補 = 商品ページの記載とGoogleサジェストから作ったキーワード。"
                         "その商品が狙っている需要の目安にはなりますが、実際に検索結果に出ているかは未確認です")
    if inc:
        st.caption("⚠️ 「候補」を含めて集計しています。表中の「候補」は検索結果での表示を確認していません。")
    return inc


def downloads(key: str, include_candidates: bool = False) -> None:
    c1, c2, _ = st.columns([1, 1, 4])
    c1.download_button("📥 Excelで保存",
                       export.to_excel(run["results"], run["df"], run.get("ai_memo"), include_candidates),
                       file_name=f"競合キーワード分析_{run['created'].replace(':', '').replace(' ', '_')}.xlsx",
                       key=f"xl_{key}")
    c2.download_button("📥 CSVで保存", export.to_csv(run["df"]),
                       file_name=f"競合キーワード分析_{run['created'].replace(':', '').replace(' ', '_')}.csv",
                       key=f"csv_{key}")


COLCFG = {
    "順位": st.column_config.NumberColumn(format="%d位"),
    "月間検索ボリューム(推定)": st.column_config.NumberColumn(format="localized"),
    "推定クリック/月(モデル値)": st.column_config.NumberColumn(format="%.1f",
                                                            help="検索ボリューム×順位別の一般的なクリック率。実際のアクセス数ではありません"),
}


def hbar(series: pd.Series, label: str) -> None:
    """1系列の横棒グラフ(値の大きい順)。"""
    s = pd.to_numeric(series, errors="coerce").dropna()
    s = s[s > 0].sort_values(ascending=False)
    if s.empty:
        st.caption("表示できるデータがありません")
        return
    data = pd.DataFrame({"項目": s.index.astype(str), label: s.values})
    chart = alt.Chart(data).mark_bar(color=BAR_COLOR, cornerRadiusEnd=4, height=18).encode(
        x=alt.X(f"{label}:Q", title=label, axis=alt.Axis(grid=True, gridOpacity=0.3)),
        y=alt.Y("項目:N", sort="-x", title=None, axis=alt.Axis(labelLimit=260, labelOverlap=False)),
        tooltip=["項目", alt.Tooltip(f"{label}:Q", format=",")],
    ).properties(height=max(120, 30 * len(s)))
    st.altair_chart(chart, use_container_width=True)


with tab_prod:
    if not need_run():
        results: list[P.ProductResult] = run["results"]
        df: pd.DataFrame = run["df"]
        st.caption(f"分析日時: {run['created']}" + (f" / 費用: {run['cost']}" if run.get("cost") else ""))
        downloads("prod", not run["df"]["found"].any() if len(run["df"]) else False)
        label = st.selectbox("商品", [p.label for p in results])
        p = next(x for x in results if x.label == label)
        d = df[df["product"] == label] if not df.empty else df
        found = d[d["found"]] if len(d) else d
        st.markdown(f"**URL:** {p.url}  \n**取得方法:** {p.method}")
        if p.page and p.page.ok:
            st.markdown(f"**ページタイトル:** {p.page.title}" + (f"  \n**価格:** {p.page.price}" if p.page.price else ""))
        for note in p.notes:
            st.caption("ℹ️ " + note)

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("表示が確認/観測されたキーワード", f"{len(found)}件")
        m2.metric("うち10位以内", f"{int((found['rank'] <= 10).sum()) if len(found) else 0}件")
        clicks = found["est_clicks"].fillna(0).sum() if len(found) else 0
        vol_known = found["search_volume"].notna().any() if len(found) else False
        m3.metric("推定クリック合計/月", f"約{clicks:,.0f}" if vol_known else "—",
                  help="モデル値。検索ボリューム×順位別の一般的なクリック率の合計で、実際のアクセス数ではありません")
        m4.metric("参考: DataForSEO推定流入/月", f"約{p.dfs_etv:,.0f}" if p.dfs_etv else "—",
                  help="DataForSEO独自の推定値。DB上の全キーワードが対象")

        if len(found):
            st.subheader("主要キーワード")
            st.dataframe(export.to_display(found, export.COMPACT), hide_index=True, use_container_width=True,
                         column_config=COLCFG)
            with st.expander("すべての列を見る(根拠・観測日・出典)"):
                st.dataframe(export.to_display(found), hide_index=True, use_container_width=True, column_config=COLCFG)
            st.subheader("この商品が獲得している需要(カテゴリー別キーワード数)")
            prof = compare.category_profile(found)
            if not prof.empty:
                hbar(prof.iloc[0], "キーワード数")
        not_found = d[~d["found"]] if len(d) else d
        if len(not_found):
            title = ("確認したが検索結果の上位に無かった候補(実測)" if not_found["rank_date"].notna().any()
                     else "候補キーワード(順位は未確認)")
            with st.expander(f"{title}: {len(not_found)}件", expanded=not len(found)):
                st.caption("ページ内容とGoogleサジェストから作った候補です。"
                           "「同サイトの別ページが表示」がある場合、その競合はカテゴリーページ等で需要を取っています。")
                cols = ["keyword", "in_suggest", "not_found_note", "same_site_url", "same_site_rank",
                        "search_volume", "category_text", "relevance"]
                st.dataframe(export.to_display(not_found, cols), hide_index=True, use_container_width=True)

with tab_cmp:
    if not need_run():
        results, df = run["results"], run["df"]
        inc = include_toggle("inc_cmp")
        downloads("cmp", inc)
        st.subheader("商品サマリー")
        st.dataframe(compare.product_summary(results, df), hide_index=True, use_container_width=True)
        mat = compare.keyword_matrix(df, inc)
        if mat.empty:
            st.info("順位が確認/観測されたキーワードがまだありません。")
        else:
            st.subheader("カテゴリー別の構成(商品 × 需要カテゴリー)")
            w = st.radio("数える単位", ["キーワード数", "推定クリック(モデル値)"], horizontal=True)
            prof = compare.category_profile(df, "count" if w == "キーワード数" else "clicks", inc)
            st.dataframe(prof.round(1), use_container_width=True)
            st.caption("各商品が、どんな種類の検索需要と結びついているかの比較。セルの値が大きいほど、そのカテゴリーの"
                       "キーワードで多く表示されています。")

            st.subheader("キーワード × 商品(順位)")
            view = st.radio("表示", ["共通キーワード(複数の商品が獲得)", "独自キーワード(1商品だけが獲得)", "すべて"],
                            horizontal=True)
            if view.startswith("共通"):
                k = st.slider("何商品以上が獲得", 2, max(2, len(results)), 2)
                sub = mat[mat["商品数"] >= k]
            elif view.startswith("独自"):
                sub = mat[mat["商品数"] == 1]
                who = st.selectbox("商品で絞り込み", ["(すべて)"] + [p.label for p in results])
                if who != "(すべて)" and who in sub.columns:
                    sub = sub[sub[who].notna()]
            else:
                sub = mat
            st.dataframe(sub.fillna(""), use_container_width=True, height=min(700, 38 + 35 * len(sub)),
                         column_config={"検索ボリューム": st.column_config.NumberColumn(format="localized"),
                                        "推定クリック合計": st.column_config.NumberColumn(format="%.1f")})
            st.caption(f"{len(sub)}件。空欄 = その商品では表示が確認/観測されていない。")

with tab_mkt:
    if not need_run():
        results, df = run["results"], run["df"]
        inc = include_toggle("inc_mkt")
        downloads("mkt", inc)
        dm = compare.demand_map(df, inc)
        if dm.empty:
            st.info("順位が確認/観測されたキーワードがまだありません。")
        else:
            st.subheader("競合各社が獲得している検索需要(特徴語別)")
            st.caption("競合商品が表示されているキーワードを、特徴語(幅広・外反母趾・通勤など)ごとにまとめたもの。"
                       "検索ボリューム合計は同じキーワードを重複して数えていません。")
            cat = st.selectbox("カテゴリー", ["(すべて)"] + sorted(dm["カテゴリー"].unique()))
            sub = dm if cat == "(すべて)" else dm[dm["カテゴリー"] == cat]
            use_vol = sub["検索ボリューム合計"].notna().any()
            metric = "検索ボリューム合計" if use_vol else "キーワード数"
            hbar(sub.set_index(sub["カテゴリー"] + ":" + sub["特徴語"])[metric].head(25), metric)
            st.dataframe(sub, hide_index=True, use_container_width=True,
                         column_config={"検索ボリューム合計": st.column_config.NumberColumn(format="localized"),
                                        "推定クリック合計": st.column_config.NumberColumn(format="%.0f")})

            st.subheader("AIによる商品企画メモ(仮説)")
            if not has_ai:
                st.caption("Claude API キーを設定すると、集計結果から商品企画の仮説メモを作れます(任意)。")
            else:
                if st.button("AIでメモを作る"):
                    from analyzer.ai import planning_memo
                    with st.spinner("作成中…"):
                        try:
                            memo = planning_memo(settings["anthropic_key"], compare.ai_summary_payload(results, df, inc),
                                                 settings.get("ai_model") or "claude-opus-5")
                            run["ai_memo"] = memo.model_dump()
                        except Exception as e:  # noqa: BLE001
                            st.error(str(e))
                memo = run.get("ai_memo")
                if memo:
                    st.warning("以下はAIの推測を含みます。事実として扱う前に、実際の検索結果や自社データで確認してください。")
                    st.markdown("**データから読み取れること**\n" + "\n".join(f"- {x}" for x in memo["observations"]))
                    st.markdown("**仮説(推測)**\n" + "\n".join(f"- {x}" for x in memo["hypotheses"]))
                    st.markdown("**確認すべきこと**\n" + "\n".join(f"- {x}" for x in memo["checks"]))

with tab_help:
    st.subheader("データの種類と信頼度")
    st.table(pd.DataFrame(export.README_ROWS[2:], columns=["項目", "説明"]))
    st.subheader("できないこと")
    st.markdown(
        "- 競合サイトの**実際の**検索流入数・アクセス数は分かりません(競合の Search Console / Analytics が必要なため)。\n"
        "- 「推定クリック」はすべてモデル値です。検索ボリュームも Google 広告データ等をもとにした推定値です。\n"
        "- 無料モードでは、ページに書かれていない語で流入しているキーワードは見つけにくくなります。\n"
        "- 検索順位は地域・端末・時期・個人の検索履歴で変わります。ここでの実測は「日本・日本語・ログインなし」の一時点です。"
    )
