import { useEffect, useState } from "react";
import type { Place } from "../../shared/models";
import { currency } from "../../shared/domain";
import { MenuRepository } from "./data/menuRepository";
import type { MenuCategory, MenuProduct } from "./model/menu";
export function PublicMenu({ place }: { place: Place }) {
  const [menu, setMenu] = useState<{
    categories: MenuCategory[];
    items: MenuProduct[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (place.menuSchemaVersion !== 2) return;
    return MenuRepository.watch(
      place.id,
      false,
      (categories, items) => {
        setMenu({ categories, items });
        setError("");
      },
      (cause) => setError(cause.message),
    );
  }, [place.id, place.menuSchemaVersion]);
  if (place.menuSchemaVersion !== 2)
    return (
      <>
        {place.menuItems.length ? (
          place.menuItems.map((item) => (
            <div className="menu-item" key={item.id}>
              <div>
                <small>{item.category}</small>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
              <strong>{currency(item.price)}</strong>
            </div>
          ))
        ) : (
          <p>Cardápio ainda não disponível.</p>
        )}
      </>
    );
  if (error) return <p role="alert">Não foi possível carregar o cardápio.</p>;
  if (!menu) return <p>Carregando cardápio…</p>;
  const categories = menu.categories.filter((category) => category.active);
  if (
    !categories.some((category) =>
      menu.items.some((item) => item.active && item.categoryId === category.id),
    )
  )
    return <p>Cardápio ainda não disponível.</p>;
  return (
    <>
      {categories.map((category) => (
        <section key={category.id}>
          <h3>{category.name}</h3>
          <p>{category.description}</p>
          {menu.items
            .filter((item) => item.active && item.categoryId === category.id)
            .map((item) => (
              <div className="menu-item" key={item.id}>
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    width={100}
                    loading="lazy"
                  />
                )}
                <div>
                  <h4>{item.name}</h4>
                  <p>{item.description}</p>
                  {!item.available && <small>Indisponível no momento</small>}
                </div>
                <strong>{currency(item.price)}</strong>
              </div>
            ))}
        </section>
      ))}
    </>
  );
}
