from korean_romanizer.romanizer import Romanizer


COMPOUND_SURNAMES = {
    "남궁",
    "독고",
    "동방",
    "사공",
    "서문",
    "선우",
    "제갈",
    "황보",
}


def romanize_korean_name(name: str) -> str:
    """Return only the romanized given name, such as 'Gildong'."""
    compact_name = "".join((name or "").split())

    if not compact_name:
        return ""

    is_hangul_name = all("\uac00" <= char <= "\ud7a3" for char in compact_name)

    if not is_hangul_name:
        romanized_parts = Romanizer(name).romanize().split()

        if len(romanized_parts) > 1:
            return "".join(romanized_parts[1:]).capitalize()

        return Romanizer(name).romanize().capitalize()

    surname_length = 2 if compact_name[:2] in COMPOUND_SURNAMES else 1
    given_name = compact_name[surname_length:]

    if not given_name:
        return ""

    romanized_given_name = "".join(
        Romanizer(char).romanize()
        for char in given_name
    ).capitalize()
    return romanized_given_name
