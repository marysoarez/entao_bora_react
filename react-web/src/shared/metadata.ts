export function setPageMetadata(
  title: string,
  description: string,
  image?: string,
) {
  document.title = title;
  for (const [key, content] of Object.entries({
    description: description,
    "og:title": title,
    "og:description": description,
    "og:image": image,
    "twitter:title": title,
    "twitter:description": description,
    "twitter:image": image,
  })) {
    const attr = key.startsWith("og:") ? "property" : "name";
    let node = document.querySelector<HTMLMetaElement>(
      `meta[${attr}="${key}"]`,
    );
    if (!content) {
      node?.remove();
      continue;
    }
    if (!node) {
      node = document.createElement("meta");
      node.setAttribute(attr, key);
      document.head.appendChild(node);
    }
    node.content = content;
  }
}
