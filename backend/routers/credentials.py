from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Credentials
from backend.crypto import encrypt, decrypt

router = APIRouter(prefix="/api/credentials", tags=["credentials"])


class CredentialsIn(BaseModel):
    hostname: str
    org_key: str
    api_id: str
    api_secret: str


class CredentialsOut(BaseModel):
    hostname: str
    org_key: str
    api_id: str
    configured: bool


def _get_creds(db: Session) -> Credentials | None:
    return db.query(Credentials).filter(Credentials.id == 1).first()


@router.get("", response_model=CredentialsOut)
def get_credentials(db: Session = Depends(get_db)):
    creds = _get_creds(db)
    if not creds:
        return CredentialsOut(hostname="", org_key="", api_id="", configured=False)
    return CredentialsOut(
        hostname=creds.hostname,
        org_key=creds.org_key,
        api_id=creds.api_id,
        configured=True,
    )


@router.post("", response_model=CredentialsOut, status_code=201)
def save_credentials(body: CredentialsIn, db: Session = Depends(get_db)):
    creds = _get_creds(db)
    if creds:
        raise HTTPException(status_code=409, detail="Credentials already exist. Use PUT to update.")
    creds = Credentials(
        id=1,
        hostname=body.hostname,
        org_key=body.org_key,
        api_id=body.api_id,
        api_secret_encrypted=encrypt(body.api_secret),
    )
    db.add(creds)
    db.commit()
    return CredentialsOut(hostname=creds.hostname, org_key=creds.org_key, api_id=creds.api_id, configured=True)


@router.put("", response_model=CredentialsOut)
def update_credentials(body: CredentialsIn, db: Session = Depends(get_db)):
    creds = _get_creds(db)
    if not creds:
        raise HTTPException(status_code=404, detail="No credentials saved yet. Use POST to create.")
    creds.hostname = body.hostname
    creds.org_key = body.org_key
    creds.api_id = body.api_id
    creds.api_secret_encrypted = encrypt(body.api_secret)
    db.commit()
    return CredentialsOut(hostname=creds.hostname, org_key=creds.org_key, api_id=creds.api_id, configured=True)


@router.delete("", status_code=204)
def delete_credentials(db: Session = Depends(get_db)):
    creds = _get_creds(db)
    if creds:
        db.delete(creds)
        db.commit()
