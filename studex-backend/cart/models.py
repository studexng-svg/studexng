from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


def compute_addon_signature(addon_quantities):
    """
    Deterministic, order-independent signature for a selection of Addons and
    their per-addon quantities (Phase 1 — Food Commerce Engine; quantity
    added in the customizations-UX pass). Choosing the same add-ons at the
    same quantities in a different order still resolves to the same
    signature, so it correctly merges into one cart line rather than
    creating a duplicate — but 2x Chicken and 1x Chicken are deliberately
    *different* signatures, since they're different customizations with
    different prices.

    `addon_quantities` accepts either a plain iterable of addon ids (the
    original calling convention — every id implies quantity 1, exactly the
    old set-based signature) or a {addon_id: quantity} mapping. Whenever
    every quantity actually is 1, this always collapses to the plain
    comma-separated-ids format regardless of which form was passed in — so
    every pre-existing CartItem row (all created before quantity existed,
    hence all effectively "qty 1 each") keeps matching new computations for
    the same picks exactly. The richer "id:qty" form only appears once some
    add-on's quantity is genuinely not 1, which never happened before this
    feature existed.

    An empty selection — every add-to-cart call for a non-menu listing, and
    a menu item ordered with no customization — always produces '', which is
    exactly the value every pre-existing CartItem row now has (see the
    AddField default below). That's what makes the widened uniqueness
    constraint on CartItem a strict superset of the old one: for any
    listing that never has add-ons selected, "(user, listing, '')" behaves
    identically to the old "(user, listing)", because '' is the only
    signature that can ever occur for it.
    """
    if not addon_quantities:
        return ''
    if isinstance(addon_quantities, dict):
        pairs = {int(k): int(v) for k, v in addon_quantities.items()}
    else:
        pairs = {int(a): 1 for a in addon_quantities}
    if all(qty == 1 for qty in pairs.values()):
        return ','.join(str(i) for i in sorted(pairs))
    return ','.join(f'{addon_id}:{qty}' for addon_id, qty in sorted(pairs.items()))


class CartItem(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='cart_items')
    listing = models.ForeignKey('services.Listing', on_delete=models.CASCADE, related_name='cart_items')
    quantity = models.PositiveIntegerField(default=1)
    # Phase 1 — Food Commerce Engine. Stored (not computed on the fly) so it
    # can participate in a DB-level uniqueness constraint — the same
    # "enforce it in the database, not just in application code" principle
    # already used for DeliveryVerificationEvent's uniqueness in Blocker 4.
    # Always '' for a plain listing or an unmodified menu item — see
    # compute_addon_signature's docstring for why that preserves the
    # original (user, listing) constraint's behavior exactly.
    addon_signature = models.CharField(max_length=255, blank=True, default='')
    reserved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Widened from ('user', 'listing') — a strict superset for any row
        # with the default '' signature, so every existing row and every
        # non-menu add-to-cart call keeps exactly the same dedup behavior it
        # always had. Only diverges (permits a second row for one listing)
        # when two different, non-empty add-on selections are stored.
        unique_together = ('user', 'listing', 'addon_signature')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} — {self.listing.title} ×{self.quantity}"


class CartItemAddon(models.Model):
    """
    A buyer's pre-checkout add-on selection on a cart item (Phase 1 — Food
    Commerce Engine). Normalized rather than a JSON blob — a cart is
    short-lived and gets fully re-validated at checkout regardless (price,
    availability, and add-on prices are never trusted from the cart), so
    there's no historical-accuracy need driving the JSON-vs-row choice the
    way there is for a placed order's OrderItemAddon.
    """
    cart_item = models.ForeignKey(CartItem, on_delete=models.CASCADE, related_name='selected_addons')
    addon = models.ForeignKey('services.Addon', on_delete=models.CASCADE, related_name='cart_selections')
    price_delta_at_add_time = models.DecimalField(max_digits=10, decimal_places=2)
    # How many units of this add-on within this one dish (e.g. 2x Chicken) —
    # multiplies price_delta_at_add_time in pricing, independent of the
    # cart item's own `quantity` (how many of the whole dish). Default 1
    # keeps every pre-existing row's math identical to before this existed.
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        verbose_name = "Cart Item Add-on"
        verbose_name_plural = "Cart Item Add-ons"

    def __str__(self):
        return f"{self.cart_item} — {self.addon.name}"
