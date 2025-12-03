// updatePages.mjs
import fs from "fs";

const filePath = "index.html";

// ===================================================================
// 1) HTML読み込み
// ===================================================================
let html = fs.readFileSync(filePath, "utf8");

// ===================================================================
// 2) 既存のページ番号・段落番号表示を削除
//    - page-number: divごと消す（後で付け直す）
//    - para-number: spanごと消す（もう使わない）
// ===================================================================
html = html.replace(/<div class="page-number">[\s\S]*?<\/div>/g, "");
html = html.replace(/<span class="para-number">[\s\S]*?<\/span>/g, "");

// ===================================================================
// 3) ページ番号・page id/data-page を付け直し
//    - <section class="page"> は必ず左端
//    - section 内側は一旦すべてインデント2スペースで揃える
// ===================================================================
let pageIndex = 0;

html = html.replace(
  /<section\s+class="page"([^>]*)>([\s\S]*?)<\/section>/g,
  (match, attrs, content) => {
    pageIndex++;
    const p = pageIndex;

    // 既存の id / data-page を削除
    let cleanAttr = attrs.replace(/\s(id|data-page)="[^"]*"/g, "");
    cleanAttr = cleanAttr.trim() ? " " + cleanAttr.trim() : "";

    const inner = content.replace(/^\s*\n/, "").trimEnd();

    // section 内の各行の先頭に 2スペース追加
    const indentedInner = inner
      .split("\n")
      .map(line => "  " + line.trimStart())
      .join("\n");

    // ページ番号も同じインデントで追加
    const newContent = `${indentedInner}\n  <div class="page-number">${p}</div>`;

    // section 開始行は左詰め、中身は改行＋インデント付きで返す
    return `<section class="page"${cleanAttr} id="page-${p}" data-page="${p}">
${newContent}
</section>`;
  }
);

// ===================================================================
// 4) 各ページ内の h1-6 + p を整形しつつ番号付け
//    - <p>, <h*> はインデント2スペース
//    - 本文はインデント4スペース（mark/strong 含む）
//    - mark と class の間で改行されていたら1行に潰す
//    - ★ para-number span はもう生成しない ★
// ===================================================================
html = html.replace(
  /<section class="page"[^>]*>[\s\S]*?<\/section>/g,
  (sectionHtml) => {
    const pageMatch = sectionHtml.match(/data-page="(\d+)"/);
    const page = pageMatch ? pageMatch[1] : "0";

    let local = 0;

    const updated = sectionHtml.replace(
      /(\s*)<(p|h[1-6])([^>]*)>([\s\S]*?)<\/(p|h[1-6])>/g,
      (m, indent, tag, attrs, body) => {
        local++;

        // 既存の id / data-para を削除
        let cleanAttrs = attrs.replace(/\s(id|data-para)="[^"]*"/g, "");
        cleanAttrs = cleanAttrs.trim();

        // 本文側に残っている旧 para-number span を掃除（保険）
        let cleanBody = body
          .replace(/<span class="para-number">[\s\S]*?<\/span>/g, "")
          .trim();

        // <mark \n class="hl-xxx"> などを1行にまとめる
        cleanBody = cleanBody.replace(/<(\w+)\s*\n\s+/g, "<$1 ");
        cleanBody = cleanBody.replace(/<mark\s*\n\s+class="/g, '<mark class="');
        cleanBody = cleanBody.replace(/<strong\s*\n\s+class="/g, '<strong class="');

        // 行ごとに分割して、余計な先頭スペースを削る
        const bodyLines = cleanBody
          .split("\n")
          .map(line => line.trimStart())
          .filter(line => line.length > 0);

        const indent1 = "  ";   // <p>, <h*> の位置
        const indent2 = "    "; // 本文の位置

        const paraId = `p${page}-${local}`;

        // 開きタグ
        let openingTag = `${indent1}<${tag}`;
        if (cleanAttrs) openingTag += ` ${cleanAttrs}`;
        openingTag += ` id="${paraId}" data-para="${local}">`;

        // 本文ブロック（4スペースインデント）
        const bodyBlock =
          bodyLines.length > 0
            ? indent2 + bodyLines.join("\n" + indent2)
            : "";

        const closingLine = `${indent1}</${tag}>`;

        if (bodyBlock) {
          // ★ もう para-number span は挟まない ★
          return `${openingTag}\n${bodyBlock}\n${closingLine}`;
        } else {
          // 本文が空の見出しなど
          return `${openingTag}\n${closingLine}`;
        }
      }
    );

    return updated;
  }
);
// ===================================================================
// 4.5) 図番号メタを付与: <img class="fig"> に data-fig="図N" を自動付加
//      ついでに alt 先頭も「図N：」で上書き（既存の図番号があれば取り除く）
// ===================================================================
{
  let figIndex = 0;

  html = html.replace(
    /<img([^>]*class="[^"]*\bfig\b[^"]*"[^>]*)>/g,
    (m, attrs) => {
      figIndex++;

      let newAttrs = attrs;

      // 既存 data-fig があれば削除（保険）
      newAttrs = newAttrs.replace(/\sdata-fig="[^"]*"/g, "");

      // alt を処理
      const altMatch = newAttrs.match(/\salt="([^"]*)"/);
      if (altMatch) {
        const originalAlt = altMatch[1].trim();
        const stripped = originalAlt.replace(/^図\d+：/, "").trim();
        const newAlt = `図${figIndex}：${stripped}`;
        newAttrs = newAttrs.replace(
          /\salt="[^"]*"/,
          ` alt="${newAlt}"`
        );
      } else {
        // alt が無ければ追加
        newAttrs += ` alt="図${figIndex}："`;
      }

      // data-fig を追加
      newAttrs += ` data-fig="図${figIndex}"`;

      return `<img${newAttrs}>`;
    }
  );
}

// ===================================================================
// 5) 空行とインデントの調整
// ===================================================================

// <section> や <div> の直後に <p> / <h*> / <div> / <span> / <a> が
// 同じ行で続かないように、間に改行を入れる
html = html.replace(
  /(<(section|div)\b[^>]*>)[ \t]+(<(p|h[1-6]|div|span|a)\b[^>]*>)/g,
  "$1\n  $3"
);

// </p>, </h*>, </div>, </section> の直後に次のタグが同じ行で続かないようにする
html = html.replace(
  /<\/(p|h[1-6]|div|section)>(?!\s*\n)(\s*)</g,
  "</$1>\n$2<"
);

// 連続空行 → 1つに圧縮
html = html.replace(/\n\s*\n\s*\n+/g, "\n\n");

// 行末スペース除去
html = html
  .split("\n")
  .map(line => line.trimEnd())
  .join("\n");

// 念のためもう一度「タグ直後に改行」ルールを補強
html = html.replace(
  /<\/(p|h[1-6]|div|section)>(?!\s*\n)(\s*)</g,
  "</$1>\n$2<"
);
html = html.replace(/\n\s*\n\s*\n+/g, "\n\n");
html = html
  .split("\n")
  .map(line => line.trimEnd())
  .join("\n");

// ===================================================================
// 6) <body>, </body>, <section>, </section> を必ず左端に揃える
// ===================================================================
html = html.replace(/^\s*<body>/m, "<body>");
html = html.replace(/^\s*<\/body>/m, "</body>");
html = html.replace(/^\s*<section\b/gm, match => match.trimStart());
html = html.replace(/^\s*<\/section>/gm, "</section>");

fs.writeFileSync(filePath, html, "utf8");

console.log("OK: 段落番号・ページ番号再付与＋段落整形（para-number除去版）が完了しました。");
