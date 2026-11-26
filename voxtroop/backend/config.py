import re
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator, model_validator


class ConsultationField(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    question: str = Field(min_length=1, max_length=160)
    question_hi: str = Field(default="", max_length=160)


class Product(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,119}$")
    name: str = Field(min_length=1, max_length=160)
    details: str = Field(min_length=1, max_length=1000)
    url: str = Field(default="", max_length=500)

    @field_validator("url")
    @classmethod
    def public_url(cls, value):
        if not value:
            return value
        if any(character.isspace() or character == chr(92) for character in value):
            raise ValueError("Use a public HTTPS URL or a loopback development URL")
        url = urlsplit(value)
        if (not url.hostname or url.username is not None or url.password is not None
            or not (url.scheme == "https" or url.scheme == "http" and url.hostname in
                    {"localhost", "127.0.0.1", "::1"})):
            raise ValueError("Use a public HTTPS URL or a loopback development URL")
        _ = url.port
        return value


class BusinessConfig(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    industry: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=2000)
    timezone: str = "Asia/Kolkata"
    opens: int = Field(default=9, ge=0, le=23)
    closes: int = Field(default=17, ge=1, le=24)
    languages: list[str] = Field(default_factory=lambda: ["English", "Hindi"], min_length=1, max_length=10)
    consultation_fields: list[ConsultationField] = Field(default_factory=list, max_length=8)
    widget_origins: list[str] = Field(default_factory=list, max_length=10)
    widget_welcome: str = Field(default="", max_length=250)
    widget_theme: Literal["green", "blue"] = "green"
    products: list[Product] = Field(default_factory=list, max_length=100)
    product_label: str = Field(default="product", min_length=1, max_length=40)
    appointment_label: str = Field(default="Appointment", min_length=1, max_length=80)
    appointment_label_hi: str = Field(default="अपॉइंटमेंट", min_length=1, max_length=80)
    booking_policy: Literal["automatic", "approval"] = "automatic"

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value):
        try:
            ZoneInfo(value)
        except (ValueError, ZoneInfoNotFoundError) as error:
            raise ValueError("Use a valid IANA timezone") from error
        return value

    @field_validator('widget_origins')
    @classmethod
    def validate_origins(cls, values):
        if any(not re.fullmatch(r'https?://[A-Za-z0-9.-]+(?::[0-9]{1,5})?', origin) for origin in values):
            raise ValueError('Use exact HTTP or HTTPS origins with no path')
        return values

    @model_validator(mode="after")
    def validate_hours(self):
        if self.closes <= self.opens:
            raise ValueError("Closing hour must follow opening hour")
        keys = [field.key for field in self.consultation_fields]
        reserved = {"name", "email", "need", "budget", "timeline", "preferred_language", "booking_contact"}
        if len(keys) != len(set(keys)) or reserved.intersection(keys):
            raise ValueError("Use unique consultation keys distinct from built-in profile fields")
        if len({product.id for product in self.products}) != len(self.products):
            raise ValueError("Use unique product identifiers")
        return self


DEMO = {
    "edunext": BusinessConfig(
        name="EduNext Academy", industry="Education",
        description="Fictional academy offering live online science and mathematics courses.",
        consultation_fields=[
            ConsultationField(key="background", question="What is your current educational background?",
                              question_hi="आपकी वर्तमान पढ़ाई किस विषय में है?"),
            ConsultationField(key="career_goal", question="What would you like to achieve with the course?",
                              question_hi="आप इस कोर्स से क्या हासिल करना चाहते हैं?"),
            ConsultationField(key="skills", question="What programming or data skills do you already have?",
                              question_hi="आपको प्रोग्रामिंग या डेटा से जुड़े कौन से कौशल पहले से आते हैं?"),
        ],
    ),
    "urbanhomes": BusinessConfig(
        name="UrbanHomes", industry="Real estate",
        description="Fictional property agency arranging apartment consultations and tours.",
    ),
}
