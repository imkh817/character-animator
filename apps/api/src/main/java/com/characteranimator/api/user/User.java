package com.characteranimator.api.user;

import com.characteranimator.api.common.entity.BaseEntity;
import com.github.f4b6a3.uuid.UuidCreator;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User extends BaseEntity {

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String nickname;

    protected User() {
    }

    private User(String email, String passwordHash, String nickname) {
        super(UuidCreator.getTimeOrderedEpoch());
        this.email = email;
        this.passwordHash = passwordHash;
        this.nickname = nickname;
    }

    public static User signUp(String email, String encodedPassword, String nickname) {
        return new User(email, encodedPassword, nickname);
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getNickname() {
        return nickname;
    }
}
