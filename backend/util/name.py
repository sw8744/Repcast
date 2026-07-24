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
    """Convert a Korean name to a display form such as 'Hong Gildong'."""
    compact_name = "".join((name or "").split())

    if not compact_name:
        return ""

    is_hangul_name = all("\uac00" <= char <= "\ud7a3" for char in compact_name)

    if not is_hangul_name:
        romanized_parts = Romanizer(name).romanize().split()

        if len(romanized_parts) > 1:
            surname = romanized_parts[0].capitalize()
            given_name = "".join(romanized_parts[1:]).capitalize()
            return f"{surname} {given_name}"

        return Romanizer(name).romanize().capitalize()

    surname_length = 2 if compact_name[:2] in COMPOUND_SURNAMES else 1
    surname = compact_name[:surname_length]
    given_name = compact_name[surname_length:]

    romanized_surname = Romanizer(surname).romanize().capitalize()

    if not given_name:
        return romanized_surname

    romanized_given_name = "".join(
        Romanizer(char).romanize()
        for char in given_name
    ).capitalize()
    return f"{romanized_surname} {romanized_given_name}"
