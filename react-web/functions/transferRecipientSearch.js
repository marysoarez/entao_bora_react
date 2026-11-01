export function normalizeSearchText(value) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
    : "";
}

export function searchGrams(name, email) {
  const grams = new Set();
  for (const value of [name, email]) {
    const text = normalizeSearchText(value).slice(0, 320);
    for (const size of [2, 3]) {
      for (let index = 0; index <= text.length - size; index += 1) {
        grams.add(text.slice(index, index + size));
      }
    }
  }
  return [...grams];
}

export function recipientMatches(profile, uid, actorUid, term) {
  if (!profile || typeof uid !== "string" || uid === actorUid) return false;
  if (profile.id !== uid || profile.active !== true) return false;
  if (!["user", "partner", "admin"].includes(profile.role)) return false;
  const query = normalizeSearchText(term);
  if (query.length < 2) return false;
  const name = normalizeSearchText(profile.name);
  const email = normalizeSearchText(profile.email);
  return name.includes(query) || email.includes(query);
}

export function canTransferEvent(actor, event, place, membership) {
  if (!actor || actor.active !== true) return false;
  if (actor.role === "admin") return true;

  const responsible = (owner) =>
    typeof owner === "string" && owner.length > 0 &&
    (owner === actor.uid || (actor.role === "partner" && actor.partnerId === owner));

  if (place) {
    if (membership) {
      return membership.active === true && membership.uid === actor.uid &&
        membership.placeId === place.id && membership.role === "owner";
    }
    if (responsible(place.ownerId)) return true;
  } else if (membership) {
    return false;
  }
  return actor.role === "partner" && responsible(event?.createdBy);
}

export function makeRecipient(profile, uid) {
  return {
    id: uid,
    name: typeof profile.name === "string" ? profile.name.trim() : "",
    email: typeof profile.email === "string" ? profile.email.trim() : "",
  };
}
