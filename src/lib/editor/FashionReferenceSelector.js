const ROLE_WEIGHT = {
  hero_front: 100,
  hero_side: 90,
  hero_back: 80,
  detail_hood: 70,
  detail_closure: 65,
  detail_texture: 60,
  detail_logo: 55,
  detail_sleeve: 50,
};

export function normalizeFashionRefs(productRefs = []) {
  return productRefs
    .filter(function (r) {
      return r && r.url;
    })
    .map(function (ref, index) {
      return {
        url: ref.url,
        role: ref.role || 'detail_texture',
        priority: typeof ref.priority === 'number' ? ref.priority : index + 1,
      };
    });
}

export function selectFashionRefs(productRefs = [], maxRefs = 3) {
  const normalized = normalizeFashionRefs(productRefs);

  return normalized
    .sort(function (a, b) {
      const scoreA = (ROLE_WEIGHT[a.role] || 0) - a.priority;
      const scoreB = (ROLE_WEIGHT[b.role] || 0) - b.priority;
      return scoreB - scoreA;
    })
    .slice(0, maxRefs);
}